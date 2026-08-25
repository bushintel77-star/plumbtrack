/**
 * Client-side device session — the field app's authentication boundary.
 *
 * The API rejects the legacy org header in production, so the device must
 * carry a signed bearer session. This module persists that session in
 * localStorage and enrolls once via `POST /api/auth/device` when no valid
 * session exists. Enrollment is a public endpoint guarded by the deployment's
 * bootstrap secret (`NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN`); the minted session
 * is technician-scoped in production and owner-scoped in dev/test.
 *
 * Offline-first: when the API is unreachable the app keeps working locally
 * and the outbox queues writes — `ensureAuthSession` simply returns null and
 * the boot effect retries on the next load.
 */

import { API_URL, DEFAULT_ORG_ID } from "./constants";

const SESSION_KEY = "plumbtrack-auth-session";
const DEVICE_ID_KEY = "plumbtrack-device-id";

export interface AuthSession {
  token: string;
  organizationId: string;
  role: string;
  /** Epoch seconds. */
  expiresAt: number;
}

/** A stable per-browser device identity used as the session's userId. */
export function deviceId(): string {
  if (typeof window === "undefined") return "static";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing.slice(0, 64);
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "browser";
  }
}

/** The stored session when present and unexpired, else null. */
export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

/**
 * Enroll a fresh device session. Returns the session (persisted) or null when
 * the API is unreachable / enrollment is not configured — the caller keeps
 * running local-first either way.
 */
export async function enrollDeviceSession(): Promise<AuthSession | null> {
  if (typeof window === "undefined") return null;
  const bootstrap = process.env.NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN?.trim();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${API_URL}/api/auth/device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": DEFAULT_ORG_ID,
        ...(bootstrap ? { Authorization: `Bearer ${bootstrap}` } : {}),
      },
      body: JSON.stringify({ deviceId: deviceId() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const session = (await response.json()) as AuthSession;
    if (typeof session.token !== "string" || !session.token) return null;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null; // offline-first — retried on next boot
  }
}

/** Human-friendly summary of a session for the Settings transparency row. */
export function describeSession(session: AuthSession | null): string {
  if (!session) return "Offline — demo mode, syncing paused";
  const expiry = new Date(session.expiresAt * 1000).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  return `Signed in as ${session.role} · session expires ${expiry}`;
}

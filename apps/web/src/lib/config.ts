/**
 * Environment-driven configuration with safe production defaults.
 *
 * Every tunable in the app lives here so a live deployment can override it
 * with environment variables — no code changes. All values are validated at
 * module load so a bad env blows up loudly at boot, not silently at runtime.
 *
 * Naming convention (Next.js): only `NEXT_PUBLIC_*` vars are inlined into
 * the browser bundle. Server-only vars (metadata etc.) read `process.env`
 * directly and must not be prefixed.
 */

export interface AppConfig {
  /** App display name. */
  appName: string;
  /** Legal/trading name shown in headers and settings. */
  orgName: string;
  /** Tenant id sent on every API request (`x-organization-id`). */
  orgId: string;
  /** Standard labour rate ($/hr) billed to customers. */
  standardRate: number;
  /** Fixed callout fee ($) added to every invoice. */
  calloutFee: number;
  /** GST fraction (legislated — not configurable). */
  gstRate: number;
  /** Technician ordinary hourly pay rate ($/hr) for the pay engine. */
  staffHourlyRate: number;
  /** ATO cents-per-km allowance for personal-vehicle travel. */
  centsPerKm: number;
  /** Base URL of the backend API, used by the sync outbox. */
  apiUrl: string;
  /** Milliseconds a single API request may take before it aborts. */
  apiTimeoutMs: number;
}

function num(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: "${value}" is not a number`);
  }
  return parsed;
}

/** NEXT_PUBLIC_* values must be read through STATIC `process.env.X` member
 *  expressions — Next.js inlines only those at build time. The previous
 *  dynamic `process.env[key]` lookup compiled into the browser bundle and
 *  every read returned undefined, so the deployed PWA silently fell back to
 *  the localhost defaults (live-verified 2026-09-09: the production chunk
 *  carried a baked http://localhost:8080 apiUrl). Empty strings count as
 *  unset — Docker builds pass NEXT_PUBLIC_* build args as possibly-empty env
 *  values, and an empty value must fall back to the code default. */
const STATIC_ENV = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_ORG_NAME: process.env.NEXT_PUBLIC_ORG_NAME,
  NEXT_PUBLIC_ORG_ID: process.env.NEXT_PUBLIC_ORG_ID,
  NEXT_PUBLIC_STANDARD_RATE: process.env.NEXT_PUBLIC_STANDARD_RATE,
  NEXT_PUBLIC_CALLOUT_FEE: process.env.NEXT_PUBLIC_CALLOUT_FEE,
  NEXT_PUBLIC_STAFF_HOURLY_RATE: process.env.NEXT_PUBLIC_STAFF_HOURLY_RATE,
  NEXT_PUBLIC_CENTS_PER_KM: process.env.NEXT_PUBLIC_CENTS_PER_KM,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_TIMEOUT_MS: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
} as const;

type EnvKey = keyof typeof STATIC_ENV;

const env = (key: EnvKey): string | undefined => {
  const value = STATIC_ENV[key];
  return value === undefined || value === "" ? undefined : value;
};

/** Scheme-less hosts (e.g. Railway's RAILWAY_PUBLIC_DOMAIN refs, which carry
 *  no scheme) must become absolute URLs — a bare host in `fetch` resolves as
 *  a relative path on the app origin and every API call 404s. */
function normalizeApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const IS_PROD = process.env.NODE_ENV === "production";

function prodWarn(usingDefault: boolean, message: string): void {
  if (IS_PROD && usingDefault) console.error(`[web] ${message}`);
}

const ORG_NAME_DEFAULT = !env("NEXT_PUBLIC_ORG_NAME");
const ORG_ID_DEFAULT = !env("NEXT_PUBLIC_ORG_ID");
const PAY_RATE_DEFAULT = !env("NEXT_PUBLIC_STAFF_HOURLY_RATE");
const API_URL_DEFAULT = !env("NEXT_PUBLIC_API_URL");
if (IS_PROD && (ORG_NAME_DEFAULT || ORG_ID_DEFAULT || API_URL_DEFAULT || PAY_RATE_DEFAULT)) {
  console.error(
    "[web] Production build is using default configuration: " +
      [
        ORG_NAME_DEFAULT && "NEXT_PUBLIC_ORG_NAME (branding)",
        ORG_ID_DEFAULT && "NEXT_PUBLIC_ORG_ID (tenancy)",
        API_URL_DEFAULT && "NEXT_PUBLIC_API_URL (api origin)",
        PAY_RATE_DEFAULT && "NEXT_PUBLIC_STAFF_HOURLY_RATE (pay engine)",
      ]
        .filter(Boolean)
        .join(", ") +
      ". Set these at build time.",
  );
}

export const config: AppConfig = {
  appName: env("NEXT_PUBLIC_APP_NAME") ?? "PlumbTrack",
  orgName: env("NEXT_PUBLIC_ORG_NAME") ?? "Caulfield South Plumbing",
  orgId: env("NEXT_PUBLIC_ORG_ID") ?? "org_caulfield_south",
  standardRate: num(env("NEXT_PUBLIC_STANDARD_RATE"), 145, "NEXT_PUBLIC_STANDARD_RATE"),
  calloutFee: num(env("NEXT_PUBLIC_CALLOUT_FEE"), 85, "NEXT_PUBLIC_CALLOUT_FEE"),
  gstRate: 0.1, // GST Act 1999 (Cth) s 9-70 — not configurable
  staffHourlyRate: num(env("NEXT_PUBLIC_STAFF_HOURLY_RATE"), 55, "NEXT_PUBLIC_STAFF_HOURLY_RATE"),
  centsPerKm: num(env("NEXT_PUBLIC_CENTS_PER_KM"), 88, "NEXT_PUBLIC_CENTS_PER_KM"),
  apiUrl: normalizeApiUrl(env("NEXT_PUBLIC_API_URL") ?? "http://localhost:8080"),
  apiTimeoutMs: num(env("NEXT_PUBLIC_API_TIMEOUT_MS"), 10_000, "NEXT_PUBLIC_API_TIMEOUT_MS"),
};
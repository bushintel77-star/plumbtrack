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

const env = (key: string): string | undefined =>
  typeof process !== "undefined" ? process.env[key] : undefined;

export const config: AppConfig = {
  appName: env("NEXT_PUBLIC_APP_NAME") ?? "PlumbTrack",
  orgName: env("NEXT_PUBLIC_ORG_NAME") ?? "Caulfield South Plumbing",
  orgId: env("NEXT_PUBLIC_ORG_ID") ?? "org_caulfield_south",
  standardRate: num(env("NEXT_PUBLIC_STANDARD_RATE"), 145, "NEXT_PUBLIC_STANDARD_RATE"),
  calloutFee: num(env("NEXT_PUBLIC_CALLOUT_FEE"), 85, "NEXT_PUBLIC_CALLOUT_FEE"),
  gstRate: 0.1, // GST Act 1999 (Cth) s 9-70 — not configurable
  staffHourlyRate: num(env("NEXT_PUBLIC_STAFF_HOURLY_RATE"), 55, "NEXT_PUBLIC_STAFF_HOURLY_RATE"),
  centsPerKm: num(env("NEXT_PUBLIC_CENTS_PER_KM"), 88, "NEXT_PUBLIC_CENTS_PER_KM"),
  apiUrl: (env("NEXT_PUBLIC_API_URL") ?? "http://localhost:8080").replace(/\/+$/, ""),
  apiTimeoutMs: num(env("NEXT_PUBLIC_API_TIMEOUT_MS"), 10_000, "NEXT_PUBLIC_API_TIMEOUT_MS"),
};
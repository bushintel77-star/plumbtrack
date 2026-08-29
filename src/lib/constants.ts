/** FieldLoop field agent configuration. EXPO_PUBLIC_* vars are inlined at
 *  build time by Metro (the RN equivalent of NEXT_PUBLIC_*). */

const env = (key: string): string | undefined =>
  typeof process !== "undefined" ? process.env[key] : undefined;

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  appName: env("EXPO_PUBLIC_APP_NAME") ?? "PlumbTrack",
  orgName: env("EXPO_PUBLIC_ORG_NAME") ?? "Caulfield South Plumbing",
  orgId: env("EXPO_PUBLIC_ORG_ID") ?? "org_caulfield_south",
  /** Demo mode: seeded jobs, no API calls — developable with zero backend. */
  forceDemo: env("EXPO_PUBLIC_FORCE_DEMO") === "1",
  staffHourlyRate: num(env("EXPO_PUBLIC_STAFF_HOURLY_RATE"), 55),
  centsPerKm: num(env("EXPO_PUBLIC_CENTS_PER_KM"), 88),
  apiUrl: (env("EXPO_PUBLIC_API_URL") ?? "http://localhost:8080").replace(/\/+$/, ""),
  /** Live stream endpoint — derived from the API URL unless overridden. */
  wsUrl:
    env("EXPO_PUBLIC_WS_URL") ??
    ((env("EXPO_PUBLIC_API_URL") ?? "http://localhost:8080").replace(/\/+$/, "").replace(/^http/, "ws") + "/api/stream"),
  apiTimeoutMs: num(env("EXPO_PUBLIC_API_TIMEOUT_MS"), 10_000)
} as const

// Award-engine rate constants (same names as apps/web so award.ts ports verbatim).
export const STAFF_HOURLY_RATE = config.staffHourlyRate
export const CENTS_PER_KM = config.centsPerKm

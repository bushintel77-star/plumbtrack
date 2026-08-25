/** Business constants — single source of truth. */

export const RATE_STANDARD = 145;
export const CALLOUT_FEE = 85;
export const GST_RATE = 0.1;

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const DEFAULT_ORG_ID = "org_caulfield_south";

/** Technician ordinary hourly pay rate ($/hr) — demo stand-in for the
 *  MA000036 ordinary rate used by the shift pay engine. */
export const STAFF_HOURLY_RATE = 55;

/** ATO cents-per-km car allowance rate for personal-vehicle travel claimed
 *  at log-off (STP Phase 2 "Allowance — cents per km"). */
export const CENTS_PER_KM = 88;

/** localStorage key for persisted state. */
export const STORAGE_KEY = "plumbtrack-v2";

/** Duration of the simulated GPS lock (ms). */
export const GPS_LOCK_DURATION_MS = 1500;

/** Duration of the simulated Xero sync (ms). */
export const XERO_SYNC_DURATION_MS = 2000;

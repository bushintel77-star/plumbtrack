/** Business constants — single source of truth. */

export const RATE_STANDARD = 145;
export const CALLOUT_FEE = 85;
export const GST_RATE = 0.1;

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const DEFAULT_ORG_ID = "org_caulfield_south";

export const ENTITY = "Caulfield South Plumbing";
export const TRADE = "plumbing";

/** localStorage key for persisted state. */
export const STORAGE_KEY = "plumbtrack-v2";

/** Duration of the simulated GPS lock (ms). */
export const GPS_LOCK_DURATION_MS = 1500;

/** Duration of the simulated Xero sync (ms). */
export const XERO_SYNC_DURATION_MS = 2000;

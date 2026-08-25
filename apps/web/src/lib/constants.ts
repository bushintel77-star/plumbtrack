/**
 * Business constants — single source of truth is `./config` (env-driven).
 * These re-exports keep existing imports and tests stable.
 */

import { config } from "./config";

export const RATE_STANDARD = config.standardRate;
export const CALLOUT_FEE = config.calloutFee;
export const GST_RATE = config.gstRate;

export const API_URL = config.apiUrl;
export const API_TIMEOUT_MS = config.apiTimeoutMs;
export const DEFAULT_ORG_ID = config.orgId;

/** Technician ordinary hourly pay rate ($/hr) — demo stand-in for the
 *  MA000036 ordinary rate used by the shift pay engine. */
export const STAFF_HOURLY_RATE = config.staffHourlyRate;

/** ATO cents-per-km car allowance rate for personal-vehicle travel claimed
 *  at log-off (STP Phase 2 "Allowance — cents per km"). */
export const CENTS_PER_KM = config.centsPerKm;

/** localStorage key for persisted state. */
export const STORAGE_KEY = "plumbtrack-v2";

/** Duration of the simulated GPS lock (ms). */
export const GPS_LOCK_DURATION_MS = 1500;

/** Duration of the simulated Xero sync (ms). */
export const XERO_SYNC_DURATION_MS = 2000;
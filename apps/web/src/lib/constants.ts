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

/** Technician ordinary hourly pay rate ($/hr) driving the shift pay engine.
 *  Deployment owners must set NEXT_PUBLIC_STAFF_HOURLY_RATE to the org's
 *  actual MA000036-derived rate; config.ts logs loudly when the fallback is
 *  used in production. */
export const STAFF_HOURLY_RATE = config.staffHourlyRate;

/** ATO cents-per-km car allowance rate for personal-vehicle travel claimed
 *  at log-off (STP Phase 2 "Allowance — cents per km"). */
export const CENTS_PER_KM = config.centsPerKm;

/** localStorage key for persisted state. */
export const STORAGE_KEY = "plumbtrack-v2";

/** Real geolocation fix window (ms) — how long clock-on waits for a device
 *  GPS lock before proceeding without coordinates. No artificial delay. */
export const GPS_TIMEOUT_MS = 10_000;
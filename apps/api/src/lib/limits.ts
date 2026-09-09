/**
 * Hard caps on per-org list reads.
 *
 * The field devices and the HQ console sync the *active working set*, not
 * history. Without a cap every 5s board poll ships the org's entire job,
 * quote, and photo history and degrades linearly with table growth
 * (2026-09-07 audit, P1-5). These caps are deliberately generous relative to
 * an operational window; raise them only together with real pagination.
 */

/** Newest jobs returned by the HQ board poll. */
export const BOARD_JOB_CAP = 500;
/** Newest quotes returned by the HQ board poll. */
export const BOARD_QUOTE_CAP = 500;
/** Default page size for GET /api/jobs. */
export const JOB_LIST_DEFAULT = 100;
/** Maximum page size for GET /api/jobs. */
export const JOB_LIST_MAX = 200;
/** Max changed jobs per pull-sync response (cursor resumes past the cap). */
export const SYNC_JOB_CAP = 1000;
/** Newest documents / RFIs returned by the compliance surfaces. */
export const DOCUMENT_LIST_CAP = 500;
export const RFI_LIST_CAP = 500;

/**
 * Needs-Attention flags (design §4.6) — COMPUTED, NEVER STORED.
 *
 * Derived from job data so mobile, dispatch, and any future surface see
 * identical flags: this module is the single implementation, and it lives on
 * the API (the board payload and GET /api/needs-attention both serve it).
 * Clients must not fork their own version of these rules.
 *
 * The three rules:
 *  1. overdue            — a job still open past its scheduled end time.
 *  2. travel_buffer      — two consecutive jobs for the same technician with
 *                          insufficient travel buffer between different
 *                          addresses.
 *  3. unassigned         — a job with no resolvable technician.
 */

export interface AttentionInputJob {
  id: string;
  client: string;
  address: string;
  scope: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  appointment: {
    assignedStaffId: string | null;
    assignedStaffName: string | null;
    scheduledStart: string;
    scheduledEnd: string | null;
  } | null;
  timeEntries: Array<{ start: string; end: string | null }>;
}

export type AttentionReason = "overdue" | "travel_buffer" | "unassigned";

export interface AttentionFlag {
  /** Deterministic id: reason + primary job id (+ partner for travel). */
  id: string;
  reason: AttentionReason;
  severity: "red" | "amber" | "blue";
  jobIds: string[];
  title: string;
  detail: string;
  computedAt: string;
}

/** Minutes considered the minimum sane turnaround on site between jobs. */
const MIN_TRAVEL_BUFFER_MINUTES = 20;
/** Average door-to-door drive speed (km/h) for the coordinate fallback. */
const AVG_KMH = 40;
/** Fixed on-site turnaround (parking, handover) added to the drive estimate. */
const PARKING_MINUTES = 5;
/** No-coordinates estimate for a move between two different addresses. */
const UNKNOWN_MOVE_MINUTES = 25;

/** Wall-clock minutes from an ISO instant ("2026-09-06T11:20:00.000Z" → 680),
 *  matching the board's naive-clock arithmetic. Null when unparseable. */
function wallClock(iso: string): number | null {
  const timePart = iso.slice(11, 16);
  if (timePart.length !== 5 || timePart[2] !== ":") return null;
  const hours = Number(timePart.slice(0, 2));
  const minutes = Number(timePart.slice(3, 5));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** Same naive-calendar arithmetic the board uses — appointment timestamps are
 *  naive local instants serialized with a Z suffix. */
function isoDateOf(iso: string): string {
  return iso.slice(0, 10);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const halfChord = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

/** Drive estimate between two jobs in minutes — real coordinates win; two
 *  different addresses with no coordinates get the conservative default. */
function travelMinutes(from: AttentionInputJob, to: AttentionInputJob): number {
  if (from.lat != null && from.lng != null && to.lat != null && to.lng != null) {
    const km = haversineKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng });
    return Math.round((km / AVG_KMH) * 60 + PARKING_MINUTES);
  }
  return UNKNOWN_MOVE_MINUTES;
}

function isStillOpen(job: AttentionInputJob): boolean {
  return job.status !== "completed" && !job.timeEntries.some(entry => entry.end);
}

/**
 * Pure selector: board-shaped jobs → attention flags. No storage, no side
 * effects; `now` is injectable so tests and future surfaces pin the clock.
 */
export function computeNeedsAttention(
  jobs: AttentionInputJob[],
  now: Date = new Date()
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  const computedAt = now.toISOString();

  for (const job of jobs) {
    // 1. Overdue: open past its scheduled end.
    const scheduledEnd = job.appointment?.scheduledEnd ?? null;
    if (scheduledEnd && isStillOpen(job) && new Date(scheduledEnd).getTime() < now.getTime()) {
      const minutesOver = Math.round((now.getTime() - new Date(scheduledEnd).getTime()) / 60_000);
      flags.push({
        id: `overdue:${job.id}`,
        reason: "overdue",
        severity: "red",
        jobIds: [job.id],
        title: "Running over",
        detail: `${job.scope || job.client} (${job.appointment?.assignedStaffName ?? "unassigned"}) was due to finish ${scheduledEnd.slice(11, 16)} — still open ${minutesOver} min later.`,
        computedAt,
      });
    }

    // 3. Unassigned: no resolvable technician.
    if (!job.appointment?.assignedStaffId && isStillOpen(job)) {
      flags.push({
        id: `unassigned:${job.id}`,
        reason: "unassigned",
        severity: "blue",
        jobIds: [job.id],
        title: "Unassigned",
        detail: `${job.scope || job.client} at ${job.address} has no technician yet.`,
        computedAt,
      });
    }
  }

  // 2. Travel buffer: consecutive same-tech jobs on the same day, different
  //    addresses, without enough gap for the move.
  const byTech = new Map<string, AttentionInputJob[]>();
  for (const job of jobs) {
    const techId = job.appointment?.assignedStaffId;
    if (!techId || !job.appointment) continue;
    const list = byTech.get(techId) ?? [];
    list.push(job);
    byTech.set(techId, list);
  }
  for (const [techId, techJobs] of byTech) {
    const scheduled = techJobs
      .filter(job => job.appointment)
      .sort((a, b) => a.appointment!.scheduledStart.localeCompare(b.appointment!.scheduledStart));
    for (let i = 0; i < scheduled.length - 1; i++) {
      const from = scheduled[i];
      const to = scheduled[i + 1];
      if (from.address.trim().toLowerCase() === to.address.trim().toLowerCase()) continue;
      if (isoDateOf(from.appointment!.scheduledStart) !== isoDateOf(to.appointment!.scheduledStart)) continue;
      const end = from.appointment!.scheduledEnd;
      if (!end) continue;
      const endMinutes = wallClock(end);
      const startMinutes = wallClock(to.appointment!.scheduledStart);
      if (endMinutes === null || startMinutes === null) continue;
      const gap = startMinutes - endMinutes;
      const needed = travelMinutes(from, to);
      if (gap < needed) {
        flags.push({
          id: `travel_buffer:${from.id}:${to.id}`,
          reason: "travel_buffer",
          severity: "amber",
          jobIds: [from.id, to.id],
          title: "Tight handoff",
          detail: `${to.appointment?.assignedStaffName ?? techId} has only ${Math.max(gap, 0)} min between the ${end.slice(11, 16)} ${from.address} job and the ${to.appointment!.scheduledStart.slice(11, 16)} ${to.address} job — the move needs about ${needed} min.`,
          computedAt,
        });
      }
    }
  }

  // Deterministic order: severity (red → amber → blue), then id.
  const severityRank: Record<AttentionFlag["severity"], number> = { red: 0, amber: 1, blue: 2 };
  return flags.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));
}

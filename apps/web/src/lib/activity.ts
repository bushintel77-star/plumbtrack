import type { Job, JobActivity } from "@/types";

/**
 * Derives the operator-facing timeline from the same job record used for
 * billing and sync. This keeps the field view useful offline without creating
 * a second client-side source of truth.
 */
export function buildJobActivity(job: Job): JobActivity[] {
  const events: JobActivity[] = [];

  for (const entry of job.timeEntries ?? []) {
    if (entry.start) {
      events.push({
        id: `${entry.id}:in`,
        kind: "time",
        title: "Clocked on",
        detail: entry.lat !== null && entry.lng !== null ? "GPS location captured" : "Recorded on this device",
        createdAt: entry.start,
        staffId: entry.staffId,
        meta: entry.lat !== null && entry.lng !== null ? "GPS VERIFIED" : "LOCAL",
      });
    }
    if (entry.end) {
      const elapsedSeconds =
        entry.start && new Date(entry.end).getTime() >= new Date(entry.start).getTime()
          ? Math.max(0, Math.floor((new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 1000))
          : undefined;
      events.push({
        id: `${entry.id}:out`,
        kind: "time",
        title: "Clocked off",
        detail: "Time entry closed",
        createdAt: entry.end,
        staffId: entry.staffId,
        elapsedSeconds,
        meta: elapsedSeconds !== undefined ? "CLOSED" : "OPEN",
      });
    }
  }

  for (const photo of job.photos ?? []) {
    events.push({
      id: `photo:${photo.id}`,
      kind: "photo",
      title: `${photo.label} photo captured`,
      detail: photo.url ? "Evidence saved to this job" : "Photo queued for upload",
      createdAt: photo.takenAt ?? "1970-01-01T00:00:00.000Z",
      meta: photo.label.toUpperCase(),
    });
  }

  for (const note of job.voiceNotes ?? []) {
    events.push({
      id: `note:${note.id}`,
      kind: "note",
      title: "Job note recorded",
      detail: note.transcript,
      createdAt: note.createdAt,
      staffId: note.createdBy,
      meta: "VOICE",
    });
  }

  if (job.signature) {
    events.push({
      id: `signature:${job.id}`,
      kind: "signature",
      title: "Customer signed off",
      detail: "Completion approval is on file",
      createdAt: "1970-01-01T00:00:00.000Z",
      meta: "ON FILE",
    });
  }

  if (job.xeroSyncedAt) {
    events.push({
      id: `invoice:${job.id}`,
      kind: "invoice",
      title: "Invoice synced to Xero",
      detail: "Invoice draft created successfully",
      createdAt: job.xeroSyncedAt,
      meta: "XERO",
    });
  }

  return events
    .filter((event) => !Number.isNaN(new Date(event.createdAt).getTime()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}
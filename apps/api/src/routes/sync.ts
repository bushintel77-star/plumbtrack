import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { getOrgId, sendMissingOrg } from "../lib/tenant";

/**
 * WatermelonDB sync endpoint — pull protocol.
 *
 *   GET /api/sync?last_pulled_at=<unix seconds>
 *     → { changes: { jobs: { created, updated, deleted } }, timestamp (ms) }
 *
 * Contract notes:
 *   • First pull (no cursor): every org job ships as `created`.
 *   • Incremental: jobs with updatedAt after the cursor ship as `updated`.
 *   • `deleted` is always empty — the schema has no tombstones yet, so
 *     deletions do not propagate (documented limitation; full two-way sync
 *     adds soft-delete columns first).
 *   • Rows carry created_at/updated_at in epoch ms (Watermelon's
 *     last-write-wins conflict resolution keys on them).
 *   • The cursor parameter is SECONDS (API-friendly); the response
 *     timestamp is MS (Watermelon's unit) — the client converts.
 */

interface SyncJobRow {
  id: string;
  client: string;
  address: string;
  scope: string;
  phone: string | null;
  access_code: string | null;
  job_type: string | null;
  status: string;
  assigned_staff_id: string | null;
  field_note: string | null;
  checklist_items: Array<{ id: string; label: string; sort_order: number; completed_at: string | null; completed_by: string | null }>;
  time_entries: unknown[];
  created_at: number;
  updated_at: number;
}

function toRow(job: {
  id: string;
  client: string;
  address: string;
  scope: string;
  phone: string | null;
  accessCode: string | null;
  status: string;
  jobType?: string | null;
  fieldNote?: string | null;
  appointments?: Array<{ assignedStaffId: string | null }>;
  timeEntries: Array<{ id: string; staffId: string | null; start: Date; end: Date | null; lat: number | null; lng: number | null }>;
  checklistItems?: Array<{ id: string; label: string; sortOrder: number; completedAt: Date | null; completedBy: string | null }>;
  createdAt: Date;
  updatedAt: Date;
}): SyncJobRow {
  return {
    id: job.id,
    client: job.client,
    address: job.address,
    scope: job.scope,
    phone: job.phone,
    access_code: job.accessCode,
    job_type: job.jobType ?? null,
    status: job.status,
    // Server-authoritative assignment from the earliest schedulable
    // appointment, so a freshly-booted device knows its assigned jobs without
    // needing a live frame first.
    assigned_staff_id: job.appointments?.[0]?.assignedStaffId ?? null,
    field_note: job.fieldNote ?? null,
    checklist_items: (job.checklistItems ?? []).map(item => ({
      id: item.id,
      label: item.label,
      sort_order: item.sortOrder,
      completed_at: item.completedAt ? item.completedAt.toISOString() : null,
      completed_by: item.completedBy,
    })),
    time_entries: (job.timeEntries ?? []).map(entry => ({
      id: entry.id,
      staffId: entry.staffId,
      start: entry.start.toISOString(),
      end: entry.end ? entry.end.toISOString() : null,
      lat: entry.lat,
      lng: entry.lng
    })),
    created_at: job.createdAt.getTime(),
    updated_at: job.updatedAt.getTime()
  }
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sync", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);

    const query = request.query as { last_pulled_at?: string };
    const cursorSeconds = Number(query.last_pulled_at);
    const isFirstPull = !Number.isFinite(cursorSeconds) || cursorSeconds <= 0;
    const cursorMs = isFirstPull ? 0 : cursorSeconds * 1000;

    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        ...(isFirstPull ? {} : { updatedAt: { gt: new Date(cursorMs) } })
      },
      include: { timeEntries: true, checklistItems: { orderBy: { sortOrder: "asc" } }, appointments: { orderBy: { scheduledStart: "asc" }, take: 1 } },
      orderBy: { updatedAt: "asc" }
    });

    const rows = jobs.map(toRow);
    return {
      changes: {
        jobs: {
          created: isFirstPull ? rows : [],
          updated: isFirstPull ? [] : rows,
          deleted: []
        }
      },
      timestamp: Date.now()
    };
  });
}

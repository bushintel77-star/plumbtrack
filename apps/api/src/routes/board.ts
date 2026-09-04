import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { getOrgId, sendMissingOrg } from "../lib/tenant";

/**
 * Board view payload (gap G-1). Returns the jobs + quotes the HQ dispatch
 * board needs in a single round-trip, mapped to the shape `ApiBoardPayload`
 * in apps/hq/src/lib/adapter.ts expects.
 *
 * Each job also carries its current schedulable appointment — the same record
 * `PATCH /api/jobs/:id/assignment` mutates — plus the assigned staff member's
 * name, so the board can render the server-authoritative assignment instead of
 * inventing one client-side.
 *
 * Field mapping notes:
 *  - Prisma `TimeEntry.start`/`end` are DateTime; Fastify serializes them as
 *    ISO strings, which is what the adapter consumes.
 *  - Prisma `QuoteLine` uses `desc`/`qty`/`rate`; the adapter expects
 *    `description`/`quantity`/`unitPrice`, so we rename here at the source.
 */

export async function boardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);

    const [jobs, quotes] = await Promise.all([
      prisma.job.findMany({
        where: { orgId },
        include: {
          timeEntries: true,
          photos: { orderBy: { takenAt: "desc" } },
          // The assignment endpoint targets the earliest appointment, so the
          // board must surface that same record for the round-trip to hold.
          appointments: { orderBy: { scheduledStart: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.quote.findMany({
        where: { orgId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // `Appointment.assignedStaffId` is a plain string column (no relation), so
    // resolve staff names with a single lookup for the whole board.
    const assignedStaffIds = Array.from(
      new Set(
        jobs
          .flatMap(job => job.appointments.map(a => a.assignedStaffId))
          .filter((id): id is string => Boolean(id))
      )
    );
    const staff =
      assignedStaffIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: assignedStaffIds } },
            select: { id: true, name: true },
          })
        : [];
    const staffNameById = new Map(staff.map(user => [user.id, user.name]));

    // Org roster for the board's drag targets: every member is a valid
    // assignment target (the assignment endpoint validates org membership and
    // membership skills). Without this the HQ client falls back to seed
    // technicians whose ids never match real staff, and every live assignment
    // is rejected with 409.
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      staff: members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        role: member.role,
        skills: member.skills,
      })),
      jobs: jobs.map((job) => {
        const appointment = job.appointments[0];
        return {
          id: job.id,
          client: job.client,
          address: job.address,
          scope: job.scope,
          status: job.status,
          createdAt: job.createdAt,
          timeEntries: job.timeEntries.map((entry) => ({
            id: entry.id,
            staffId: entry.staffId,
            start: entry.start,
            end: entry.end,
          })),
          photos: job.photos.map((photo) => ({
            id: photo.id,
            label: photo.label,
            url: photo.url,
            takenAt: photo.takenAt,
          })),
          appointment: appointment
            ? {
                id: appointment.id,
                assignedStaffId: appointment.assignedStaffId,
                assignedStaffName: appointment.assignedStaffId
                  ? staffNameById.get(appointment.assignedStaffId) ?? null
                  : null,
                scheduledStart: appointment.scheduledStart,
                scheduledEnd: appointment.scheduledEnd,
                status: appointment.status,
              }
            : null,
        };
      }),
      quotes: quotes.map((quote) => ({
        id: quote.id,
        client: quote.client,
        status: quote.status,
        lines: quote.lines.map((line) => ({
          id: line.id,
          description: line.desc,
          quantity: line.qty,
          unitPrice: line.rate,
        })),
      })),
    };
  });
}

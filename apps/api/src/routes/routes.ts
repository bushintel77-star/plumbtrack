import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { recordAuditEvent } from "../lib/audit";

const ROUTE_KEY = "today";
const ROUTE_ROLES = ["technician", "dispatcher", "manager", "admin", "owner"] as const;

export async function routeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/today", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ROUTE_ROLES);
    if (roleFailure) return roleFailure;

    const jobs = await prisma.job.findMany({
      where: { orgId, status: { not: "completed" } },
      include: { appointments: { orderBy: { scheduledStart: "asc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    });
    const mapped = jobs.filter(job => Boolean(job.address));

    // The current schema has no coordinate columns yet. Return a valid,
    // versioned empty geometry while preserving the server contract. Once
    // geocoding columns land, this ordering becomes the nearest-neighbour
    // route calculation without changing the mobile response shape.
    const stops = jobs.map((job, index) => ({
      jobId: job.id,
      sequence: index + 1,
      distanceFromPreviousKm: null,
      scheduledStart: job.appointments[0]?.scheduledStart?.toISOString() ?? null,
    }));
    const geometry = { type: "LineString", coordinates: [] as number[][] };
    const latest = await prisma.routeVersion.findFirst({ where: { orgId, routeKey: ROUTE_KEY }, orderBy: { version: "desc" } });
    const version = (latest?.version ?? 0) + 1;
    const route = await prisma.routeVersion.create({
      data: { orgId, routeKey: ROUTE_KEY, version, source: "server", geometry, stops, createdBy: request.auth?.userId },
    });
    await prisma.routeRecalculationAudit.create({
      data: { orgId, routeKey: ROUTE_KEY, previousVersion: latest?.version ?? null, nextVersion: version, reason: "requested", actorUserId: request.auth?.userId, metadata: { mappedStops: mapped.length } },
    });
    recordAuditEvent(request, { action: "route.recalculated", entityType: "route", entityId: route.id, metadata: { routeKey: ROUTE_KEY, version } });
    return reply.send({ routeId: route.id, version, generatedAt: route.generatedAt.toISOString(), source: "server", geometry, stops, totalDistanceKm: 0, mappedStops: mapped.length, unmappedStops: jobs.length - mapped.length });
  });
}

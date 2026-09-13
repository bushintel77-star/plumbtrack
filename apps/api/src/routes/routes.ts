import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { recordAuditEvent } from "../lib/audit";

const ROUTE_KEY = "today";
const ROUTE_ROLES = ["technician", "dispatcher", "manager", "admin", "owner"] as const;

const EARTH_RADIUS_KM = 6371;

/** Straight-line (haversine) distance — the honestly-labelled geometry the
 *  route contract carries. Road routing stays behind /api/routing/*. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 100) / 100;
}

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
    // Dispatch order wins: appointments by scheduledStart; unscheduled jobs
    // fall to the back in creation order.
    const ordered = [...jobs].sort((a, b) => {
      const sa = a.appointments[0]?.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const sb = b.appointments[0]?.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    });
    const mapped = ordered.filter((job) => job.lat != null && job.lng != null);
    const geometry = {
      type: "LineString",
      coordinates: mapped.map((job) => [job.lng!, job.lat!]),
    };

    let previous: { lat: number; lng: number } | null = null;
    const stops = ordered.map((job, index) => {
      const at = job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null;
      const distanceFromPreviousKm = previous && at ? haversineKm(previous, at) : null;
      if (at) previous = at;
      return {
        jobId: job.id,
        sequence: index + 1,
        distanceFromPreviousKm,
        scheduledStart: job.appointments[0]?.scheduledStart?.toISOString() ?? null,
      };
    });
    const totalDistanceKm = Math.round(
      stops.reduce((sum, stop) => sum + (stop.distanceFromPreviousKm ?? 0), 0) * 100
    ) / 100;

    const latest = await prisma.routeVersion.findFirst({
      where: { orgId, routeKey: ROUTE_KEY },
      orderBy: { version: "desc" },
    });
    // A read endpoint must not grow a table per call: only persist a new
    // version when the stop set actually changed since the last snapshot.
    const stopsChanged = !latest || JSON.stringify(latest.stops) !== JSON.stringify(stops);
    if (!stopsChanged && latest) {
      return reply.send({
        routeId: latest.id,
        version: latest.version,
        generatedAt: latest.generatedAt.toISOString(),
        source: "server",
        geometry,
        stops,
        totalDistanceKm,
        mappedStops: mapped.length,
        unmappedStops: ordered.length - mapped.length,
      });
    }

    const version = (latest?.version ?? 0) + 1;
    const route = await prisma.routeVersion.create({
      data: { orgId, routeKey: ROUTE_KEY, version, source: "server", geometry, stops },
    });
    await prisma.routeRecalculationAudit.create({
      data: {
        orgId,
        routeKey: ROUTE_KEY,
        previousVersion: latest?.version ?? null,
        nextVersion: version,
        reason: "requested",
        actorUserId: request.auth?.userId,
        metadata: { mappedStops: mapped.length },
      },
    });
    recordAuditEvent(request, { action: "route.recalculated", entityType: "route", entityId: route.id, metadata: { routeKey: ROUTE_KEY, version } });
    return reply.send({
      routeId: route.id,
      version,
      generatedAt: route.generatedAt.toISOString(),
      source: "server",
      geometry,
      stops,
      totalDistanceKm,
      mappedStops: mapped.length,
      unmappedStops: ordered.length - mapped.length,
    });
  });
}

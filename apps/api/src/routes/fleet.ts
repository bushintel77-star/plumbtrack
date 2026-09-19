import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { publishToOrg } from "../lib/liveBus";
import { parseBody, sendValidationError } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";

/**
 * Fleet telemetry ingest — the mobile field app's shift-gated position feed.
 *
 * The field device POSTs a live van fix while a technician is CLOCKED ON (the
 * app pauses it during breaks and stops it on log-off). The server's only job
 * here is to fan the newest position out to the HQ console over the live bus;
 * it deliberately does NOT persist — telemetry is ephemeral latest-wins
 * state, and the point-in-time/time-entry path remains the durable record.
 *
 * Scope: the request's authenticated org (never a caller-supplied header) and
 * a technician role. Frames carry the org so only that org's HQ subscribers
 * receive them.
 */

const telemetrySchema = z.object({
  // The field device reports which van/tech the fix belongs to. Org is derived
  // server-side from the session; these identify the asset within that org.
  vehicleId: z.string().min(1).max(128),
  techId: z.string().min(1).max(128).nullable().optional(),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  heading: z.number().finite().gte(0).lt(360).nullable().optional(),
  speed: z.number().finite().gte(0).nullable().optional(),
  presence: z.enum(["on_job", "on_break", "off_shift"]).default("on_job"),
});

const consentSchema = z.object({
  mode: z.enum(["shift", "points"]),
  chosenAt: z.string().datetime(),
  // The outbox op id, doubling as the client's idempotency key.
  opId: z.string().min(1).max(128),
});

export async function fleetRoutes(app: FastifyInstance): Promise<void> {
  app.post("/telemetry", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    // Field devices carry a technician-scoped bearer session; dispatchers and
    // managers on HQ are not the sender.
    const roleFailure = requireRole(request, reply, ["technician"]);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(telemetrySchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const { vehicleId, techId, lat, lng, heading, speed, presence } = parsed.data;
    const timestamp = new Date().toISOString();

    publishToOrg({
      topic: "topic/fleet/telemetry",
      orgId,
      vehicleId,
      techId: techId ?? null,
      lat,
      lng,
      heading: heading ?? null,
      speed: speed ?? null,
      presence,
      timestamp,
    });

    return reply.code(202).send({ ok: true, timestamp });
  });

  /**
   * POST /location-consent — the technician's tracking-mode choice, made in
   * the field app's first-shift setup (and re-sent whenever they change it
   * in Profile). Durable record of consent lives in the audit trail; the
   * telemetry stream itself stays ephemeral. Scoped to the authenticated
   * technician — the body never carries a userId to trust.
   */
  app.post("/location-consent", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    // Any authenticated org member — deliberately broader than /telemetry.
    // The endpoint records the caller's OWN consent about their own tracking,
    // so there is no cross-user authority to gate, and a consent op parked
    // permanently in a manager's sync sheet is worse than a wider gate.
    if (!request.auth) {
      return reply.code(401).send({ message: "Sign in to continue." });
    }

    const parsed = parseBody(consentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const { mode, chosenAt, opId } = parsed.data;
    recordAuditEvent(request, {
      action: "fleet.location_consent",
      entityType: "user",
      entityId: request.auth?.userId,
      metadata: { mode, chosenAt, opId },
    });
    return reply.code(204).send();
  });
}

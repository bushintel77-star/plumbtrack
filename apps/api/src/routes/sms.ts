import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { sendSms } from "../lib/sms";

/**
 * Customer ETA notification — HQ sends "we're on our way, ETA ~X min" to the
 * job's customer. ETA is computed on the HQ client (which owns travel time);
 * the server is the only place with the customer's phone and the SMS
 * credentials, so it templates and sends. Best-effort: returns a clear result
 * and never blocks dispatch on provider availability.
 */

const etaSchema = z.object({
  jobId: z.string().trim().min(1),
  etaMinutes: z.number().int().min(0).max(24 * 60),
  message: z.string().trim().min(1).max(320).optional(),
  /** Client outbox key — a retried send returns the recorded outcome instead
   *  of double-texting the customer. */
  opId: z.string().trim().min(1).max(128).optional(),
});

export async function smsRoutes(app: FastifyInstance): Promise<void> {
  // Customer SMS costs real money per message. The global IP cap is far too
  // generous a bound for Twilio spend, so this route carries its own tight
  // limit (default 10/min per IP, env-tunable) on top of role auth.
  const smsMax = Number(process.env.SMS_RATE_LIMIT_MAX ?? 10);
  const smsWindowMs = Number(process.env.SMS_RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(smsMax) || smsMax <= 0 || !Number.isFinite(smsWindowMs) || smsWindowMs <= 0) {
    throw new Error("Invalid SMS rate-limit configuration: SMS_RATE_LIMIT_MAX and SMS_RATE_LIMIT_WINDOW_MS must be positive numbers");
  }

  app.post("/eta", { config: { rateLimit: { max: smsMax, timeWindow: smsWindowMs } } }, async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(etaSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { jobId, etaMinutes, message, opId } = parsed.data;

    const job = await prisma.job.findFirst({ where: { id: jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    if (!job.phone) return reply.code(409).send({ message: "Job has no customer phone" });

    // Idempotent replay: a prior attempt with this opId already resolved —
    // return its recorded outcome rather than texting the customer twice.
    if (opId) {
      const prior = await prisma.smsMessage.findFirst({ where: { orgId, opId } });
      if (prior) {
        return reply.code(200).send({
          sent: prior.status === "sent",
          mode: prior.status === "provider_unconfigured" ? "test" : "live",
          providerMessageId: prior.providerMessageId,
          duplicate: true,
        });
      }
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const body =
      message ??
      `${org?.name ?? "Your plumbing team"}: your technician is on the way and should arrive in about ${etaMinutes} minute${etaMinutes === 1 ? "" : "s"}.`;

    try {
      const result = await sendSms(job.phone, body);
      // Record the resolved outcome — the audit trail of what was texted,
      // and the row an opId retry dedupes on. A thrown provider error records
      // nothing so a retry legitimately retries.
      const record = await prisma.smsMessage.create({
        data: {
          orgId,
          jobId: job.id,
          phone: job.phone,
          body,
          opId: opId ?? null,
          status: result.mode === "test" ? "provider_unconfigured" : result.delivered ? "sent" : "failed",
          providerMessageId: result.providerMessageId ?? null,
          sentBy: request.auth?.userId ?? "unknown",
        },
      }).catch(() => null); // a concurrent identical opId loses the insert race — read it back below
      const stored = record ?? (opId ? await prisma.smsMessage.findFirst({ where: { orgId, opId } }) : null);
      if (result.mode === "test") {
        return reply.code(202).send({ sent: false, mode: "test", message: "SMS is not configured — no message was sent." });
      }
      return reply.code(202).send({ sent: stored?.status === "sent" || result.delivered, mode: "live", providerMessageId: result.providerMessageId });
    } catch {
      return reply.code(502).send({ message: "SMS provider failed" });
    }
  });
}

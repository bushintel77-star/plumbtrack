import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { sendSms, isSmsConfigured } from "../lib/sms";

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
});

export async function smsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/eta", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(etaSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { jobId, etaMinutes, message } = parsed.data;

    const job = await prisma.job.findFirst({ where: { id: jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    if (!job.phone) return reply.code(409).send({ message: "Job has no customer phone" });

    const body =
      message ??
      `Caulfield South Plumbing: your technician is on the way and should arrive in about ${etaMinutes} minute${etaMinutes === 1 ? "" : "s"}.`;

    try {
      const result = await sendSms(job.phone, body);
      if (result.mode === "test") {
        return reply.code(202).send({ sent: false, mode: "test", message: "SMS is not configured — no message was sent." });
      }
      return reply.code(202).send({ sent: result.delivered, mode: "live", providerMessageId: result.providerMessageId });
    } catch {
      return reply.code(502).send({ message: "SMS provider failed" });
    }
  });
}

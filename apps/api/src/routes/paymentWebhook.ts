import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { recordAuditEvent } from "../lib/audit";

function verifySignature(payload: string, header: string, secret: string): boolean {
  const timestamp = header.split(",").find(part => part.startsWith("t="))?.slice(2);
  const signature = header.split(",").find(part => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const actual = Buffer.from(signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function paymentWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Fastify 5 does not attach request.rawBody on its own — capture the exact
  // wire bytes here or signature verification can never see them.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    done(null, body);
  });
  app.post("/stripe", { config: { rawBody: true } }, async (request, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const signature = request.headers["stripe-signature"];
    const rawBody = (request as typeof request & { rawBody?: Buffer | string }).rawBody;
    if (!secret || typeof signature !== "string" || rawBody == null) {
      return reply.code(503).send({ message: "Stripe webhook verification is not configured" });
    }
    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    if (!verifySignature(payload, signature, secret)) return reply.code(400).send({ message: "Invalid Stripe signature" });
    let event: { id?: string; type?: string; data?: { object?: { id?: string; payment_status?: string; metadata?: { job_id?: string } } } };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      return reply.code(400).send({ message: "Invalid webhook payload" });
    }
    const object = event.data?.object;
    const jobId = object?.metadata?.job_id;
    if (!jobId || !event.id) return reply.send({ received: true });
    const paymentStatus =
      event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded"
        ? object.payment_status === "paid" ? "paid" : "processing"
        : event.type === "checkout.session.async_payment_failed"
          ? "failed"
          : null;
    if (paymentStatus !== null) {
      // The tenant hook exempts this webhook — resolve the job's org so the
      // audit row lands in the right tenant scope (no session exists here).
      const job = await prisma.job.findFirst({
        where: { id: jobId, stripeSessionId: object.id },
        select: { id: true, orgId: true },
      });
      const updated = await prisma.job.updateMany({
        where: { id: jobId, stripeSessionId: object.id },
        data: { paymentStatus },
      });
      if (job && updated.count > 0) {
        request.organizationId = job.orgId;
        recordAuditEvent(request, {
          action: "payment.status_changed",
          entityType: "job",
          entityId: job.id,
          metadata: { paymentStatus, eventId: event.id, eventType: event.type, stripeSessionId: object.id },
        });
      }
    }
    return reply.send({ received: true, eventId: event.id });
  });
}

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";

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
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
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
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await prisma.job.updateMany({ where: { id: jobId, stripeSessionId: object.id }, data: { paymentStatus: object.payment_status === "paid" ? "paid" : "processing" } });
    } else if (event.type === "checkout.session.async_payment_failed") {
      await prisma.job.updateMany({ where: { id: jobId, stripeSessionId: object.id }, data: { paymentStatus: "failed" } });
    }
    return reply.send({ received: true, eventId: event.id });
  });
}

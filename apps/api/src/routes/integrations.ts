import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { recordAuditEvent } from "../lib/audit";

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/deliveries", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const query = request.query as { provider?: string; status?: string };
    return prisma.integrationDelivery.findMany({
      where: {
        orgId,
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 10 } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.get("/health", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const [pending, processing, failed, deadLetter, delivered] = await Promise.all([
      prisma.integrationDelivery.count({ where: { orgId, status: "pending" } }),
      prisma.integrationDelivery.count({ where: { orgId, status: "processing" } }),
      prisma.integrationDelivery.count({ where: { orgId, status: "failed" } }),
      prisma.integrationDelivery.count({ where: { orgId, status: "dead_letter" } }),
      prisma.integrationDelivery.count({ where: { orgId, status: "delivered" } }),
    ]);
    return { pending, processing, failed, deadLetter, delivered, needsAttention: failed + deadLetter > 0 };
  });

  app.post("/deliveries/:id/retry", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const result = await prisma.integrationDelivery.updateMany({
      where: { id, orgId, status: { in: ["failed", "dead_letter"] } },
      data: { status: "pending", nextAttemptAt: new Date(), lastError: null, leaseId: null, lockedAt: null, lockedUntil: null },
    });
    if (result.count === 0) return reply.code(404).send({ message: "Retryable delivery not found" });
    recordAuditEvent(request, { action: "integration_delivery.retried", entityType: "integration_delivery", entityId: id });
    return { queued: true, id };
  });
}

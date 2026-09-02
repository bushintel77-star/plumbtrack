import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { publishToOrg } from "../lib/liveBus";

/**
 * Job-scoped two-way messaging — a short threaded note against one job.
 * Dispatch posts (office → field); the technician posts (field → office).
 * Both sides read the same ordered thread, and each post fans out live over
 * the org stream so the other side sees it immediately (with the refetch poll
 * as the durable reconciliation path).
 */

const messageSchema = z.object({
  direction: z.enum(["dispatch", "field"]),
  sender: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2_000),
});

export async function jobMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:id/messages", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });

    const messages = await prisma.jobMessage.findMany({
      where: { jobId: id, orgId },
      orderBy: { createdAt: "asc" },
    });
    return {
      messages: messages.map(m => ({
        id: m.id,
        direction: m.direction,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  });

  app.post("/:id/messages", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    // Field devices (technician) and office staff (dispatcher+) both post,
    // but only the org they belong to.
    const roleFailure = requireRole(request, reply, ["technician", "dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(messageSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });

    const message = await prisma.jobMessage.create({
      data: {
        orgId,
        jobId: id,
        direction: parsed.data.direction,
        sender: parsed.data.sender,
        body: parsed.data.body,
      },
    });

    const frame = {
      id: message.id,
      direction: message.direction as "dispatch" | "field",
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
    publishToOrg({ topic: "topic/jobs/message", orgId, jobId: id, message: frame });

    return reply.code(201).send({ message: frame });
  });
}

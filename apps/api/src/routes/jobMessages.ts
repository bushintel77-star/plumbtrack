import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import type { JobMessagePostedEvent } from "../domain/events";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { publishToOrg } from "../lib/liveBus";
import { JOB_MESSAGE_EVENT, jobThreadBridgeStatus } from "../lib/slackJobThreads";

/**
 * Job-scoped two-way messaging — a short threaded note against one job.
 * Dispatch posts (office → field); the technician posts (field → office).
 * Both sides read the same ordered thread, and each post fans out live over
 * the org stream so the other side sees it immediately (with the refetch poll
 * as the durable reconciliation path).
 *
 * When the org's Slack job-thread bridge is on, each post also rides the
 * transactional outbox into the job's Slack thread, and replies typed there
 * come back as `source: "slack"` rows (routes/slackEvents.ts).
 */

const messageSchema = z.object({
  direction: z.enum(["dispatch", "field"]),
  sender: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2_000),
  /** Field outbox key — a retry of the same post returns the stored row. */
  opId: z.string().trim().min(1).max(120).optional(),
});

/** Inbox size for GET /api/messages/threads. */
const THREAD_LIST_CAP = 100;

interface StoredMessage {
  id: string;
  direction: string;
  sender: string;
  body: string;
  source?: string | null;
  opId?: string | null;
  createdAt: Date;
}

function toWire(message: StoredMessage) {
  return {
    id: message.id,
    direction: message.direction as "dispatch" | "field",
    sender: message.sender,
    body: message.body,
    source: message.source ?? "fieldloop",
    opId: message.opId ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

export async function jobMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:id/messages", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });

    const [messages, slack] = await Promise.all([
      prisma.jobMessage.findMany({ where: { jobId: id, orgId }, orderBy: { createdAt: "asc" } }),
      jobThreadBridgeStatus(orgId),
    ]);
    return { messages: messages.map(toWire), slack };
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
    // A field session speaks for the field: it may not post a message the
    // technician's screen (and Slack) would show as coming from dispatch.
    if (request.auth?.role === "technician" && parsed.data.direction !== "field") {
      return reply.code(403).send({ message: "Field sessions post field messages only" });
    }

    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });

    const { opId } = parsed.data;
    if (opId) {
      const existing = await prisma.jobMessage.findFirst({ where: { opId, orgId, jobId: id } });
      if (existing) return reply.code(200).send({ message: toWire(existing) });
    }

    const bridge = await jobThreadBridgeStatus(orgId);
    let message: StoredMessage;
    try {
      message = await prisma.$transaction(async (tx) => {
        const created = await tx.jobMessage.create({
          data: {
            orgId,
            jobId: id,
            direction: parsed.data.direction,
            sender: parsed.data.sender,
            body: parsed.data.body,
            source: "fieldloop",
            ...(opId ? { opId } : {}),
          },
        });
        if (bridge.linked) {
          const event: JobMessagePostedEvent = {
            type: JOB_MESSAGE_EVENT,
            eventId: `${JOB_MESSAGE_EVENT}:${orgId}:${created.id}`,
            occurredAt: created.createdAt.toISOString(),
            organizationId: orgId,
            jobId: id,
            messageId: created.id,
            direction: parsed.data.direction,
            sender: created.sender,
            body: created.body,
            client: job.client,
            address: job.address,
            scope: job.scope,
          };
          await tx.domainEventOutbox.create({
            data: {
              eventId: event.eventId,
              organizationId: orgId,
              type: event.type,
              payload: JSON.parse(JSON.stringify(event)),
            },
          });
        }
        return created;
      });
    } catch (error) {
      // Two retries of the same queued post racing: the loser returns the
      // winner's row.
      if (opId && isUniqueViolation(error)) {
        const existing = await prisma.jobMessage.findFirst({ where: { opId, orgId, jobId: id } });
        if (existing) return reply.code(200).send({ message: toWire(existing) });
      }
      throw error;
    }

    const frame = toWire(message);
    recordAuditEvent(request, {
      action: "job.message_posted",
      entityType: "job_message",
      entityId: message.id,
      metadata: { jobId: id, direction: message.direction, sender: message.sender },
    });
    publishToOrg({ topic: "topic/jobs/message", orgId, jobId: id, message: frame });

    return reply.code(201).send({ message: frame, slack: bridge });
  });
}

/**
 * The field agent's Comms inbox: one row per job that has messages, newest
 * activity first, with the last message and when dispatch last wrote (for
 * unread counts), plus the org's Slack bridge state. No Slack channel history
 * is read here — technicians see job conversations, not the workspace.
 */
export async function messageThreadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/threads", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);

    const grouped = await prisma.jobMessage.groupBy({
      by: ["jobId"],
      where: { orgId },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: THREAD_LIST_CAP,
    });
    const jobIds = grouped.map((row) => row.jobId);

    const [latest, dispatchLatest, slack] = await Promise.all([
      jobIds.length
        ? prisma.jobMessage.findMany({
          where: { orgId, jobId: { in: jobIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["jobId"],
        })
        : Promise.resolve([]),
      jobIds.length
        ? prisma.jobMessage.groupBy({
          by: ["jobId"],
          where: { orgId, jobId: { in: jobIds }, direction: "dispatch" },
          _max: { createdAt: true },
        })
        : Promise.resolve([]),
      jobThreadBridgeStatus(orgId),
    ]);

    const lastByJob = new Map(latest.map((message) => [message.jobId, message]));
    const dispatchByJob = new Map(dispatchLatest.map((row) => [row.jobId, row._max.createdAt]));

    return {
      threads: grouped.flatMap((row) => {
        const last = lastByJob.get(row.jobId);
        if (!last) return [];
        const lastDispatchAt = dispatchByJob.get(row.jobId);
        return [{
          jobId: row.jobId,
          count: row._count._all,
          lastMessage: toWire(last),
          lastDispatchAt: lastDispatchAt ? lastDispatchAt.toISOString() : null,
        }];
      }),
      slack,
    };
  });
}

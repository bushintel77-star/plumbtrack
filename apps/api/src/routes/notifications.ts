import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { createNotificationSchema } from "../schemas/notification";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import type { NotificationCreatedEvent } from "../domain/events";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    // The domain route exposes no provider implementation details. This
    // compatibility status is intentionally static until integration health is
    // moved behind the neutral integration status service.
    return { slackConnected: Boolean(process.env.SLACK_WEBHOOK_URL?.trim()) };
  });

  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.notification.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const parsed = parseBody(createNotificationSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    // Make the notification and its domain event one atomic commit. A retry
    // can safely re-run the request because opId remains unique at the DB
    // layer, while a committed notification can never lose its event.
    if (parsed.data.opId) {
      const existing = await prisma.notification.findFirst({ where: { orgId, opId: parsed.data.opId } });
      if (existing) return reply.code(200).send(existing);
    }

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({ data: { ...parsed.data, orgId } });
      const event: NotificationCreatedEvent = {
        type: "notification.created",
        eventId: `notification.created:${orgId}:${created.id}`,
        occurredAt: new Date().toISOString(),
        organizationId: orgId,
        notificationId: created.id,
        channel: created.channel,
        author: created.author,
        text: created.text,
      };
      await tx.domainEventOutbox.create({
        data: {
          eventId: event.eventId,
          organizationId: event.organizationId,
          type: event.type,
          payload: JSON.parse(JSON.stringify(event)),
        },
      });
      return created;
    });
    recordAuditEvent(request, {
      action: "notification.created",
      entityType: "notification",
      entityId: notification.id,
      metadata: { channel: notification.channel },
    });
    return reply.code(201).send(notification);
  });
}

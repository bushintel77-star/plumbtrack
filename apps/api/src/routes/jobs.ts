import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import {
  createJobSchema,
  createPhotoSchema,
  createTimeEntrySchema,
  updateJobSchema,
  updateTimeEntrySchema,
} from "../schemas/job";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { type JobCompletedEvent } from "../domain/events";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { createCheckoutSession } from "../lib/payments";

/** Roles allowed to record field work (time entries and site photos). */
const FIELD_ROLES = ["technician", "dispatcher", "manager", "admin", "owner"] as const;

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.job.findMany({
      where: { orgId },
      include: { timeEntries: true, photos: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createJobSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    if (parsed.data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, orgId } });
      if (!customer) return reply.code(404).send({ message: "Customer not found" });
    }
    if (parsed.data.propertyId) {
      const property = await prisma.property.findFirst({ where: { id: parsed.data.propertyId, orgId } });
      if (!property) return reply.code(404).send({ message: "Property not found" });
      if (parsed.data.customerId && property.customerId !== parsed.data.customerId) {
        return reply.code(400).send({ message: "Property does not belong to the selected customer" });
      }
    }
    const job = await prisma.job.create({
      data: { ...parsed.data, orgId },
      include: { timeEntries: true, photos: true },
    });
    recordAuditEvent(request, {
      action: "job.created",
      entityType: "job",
      entityId: job.id,
      metadata: { status: job.status },
    });
    return reply.code(201).send(job);
  });

  app.get("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({
      where: { id, orgId },
      include: { timeEntries: true, photos: true },
    });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    return job;
  });

  app.patch("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateJobSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const updatedJob = await prisma.$transaction(async (tx) => {
      let shouldEmitCompleted = false;
      if (parsed.data.status === "completed") {
        const currentJob = await tx.job.findFirst({ where: { id, orgId } });
        if (!currentJob) return null;
        shouldEmitCompleted = currentJob.status !== "completed";
      }
      const result = await tx.job.updateMany({
        where: { id, orgId },
        data: parsed.data,
      });
      if (result.count === 0) return null;
      const updated = await tx.job.findUnique({
        where: { id },
        include: { timeEntries: true, photos: true },
      });
      if (shouldEmitCompleted && updated) {
        const timeEntries = updated.timeEntries ?? [];
        const photos = updated.photos ?? [];
        const durationSeconds = timeEntries.reduce((total, entry) => {
          if (!entry.end) return total;
          const start = entry.start instanceof Date ? entry.start.getTime() : new Date(entry.start).getTime();
          const end = entry.end instanceof Date ? entry.end.getTime() : new Date(entry.end).getTime();
          return total + Math.max(0, (end - start) / 1000);
        }, 0);
        const event: JobCompletedEvent = {
          type: "job.completed",
          eventId: `job.completed:${orgId}:${updated.id}`,
          occurredAt: new Date().toISOString(),
          organizationId: orgId,
          jobId: updated.id,
          client: updated.client,
          address: updated.address,
          scope: updated.scope,
          technicianId: request.auth?.userId,
          durationSeconds,
          photoCount: photos.length,
          customerSigned: Boolean(updated.signature),
        };
        await tx.domainEventOutbox.create({
          data: {
            eventId: event.eventId,
            organizationId: event.organizationId,
            type: event.type,
            payload: JSON.parse(JSON.stringify(event)),
          },
        });
      }
      return updated;
    });
    if (!updatedJob) return reply.code(404).send({ message: "Job not found" });
    recordAuditEvent(request, {
      action: "job.updated",
      entityType: "job",
      entityId: id,
      metadata: parsed.data,
    });
    return updatedJob;
  });

  app.delete("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const result = await prisma.job.deleteMany({ where: { id, orgId } });
    if (result.count === 0) return reply.code(404).send({ message: "Job not found" });
    recordAuditEvent(request, { action: "job.deleted", entityType: "job", entityId: id });
    return reply.code(204).send();
  });

  // Time entries
  app.post("/:id/time-entries", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const parsed = parseBody(createTimeEntrySchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    // Idempotent replay: if this op was already acknowledged (offline queue
    // retried after an ambiguous failure), return the existing entry instead
    // of creating a duplicate.
    if (parsed.data.opId) {
      const existing = await prisma.timeEntry.findFirst({
        where: { opId: parsed.data.opId, jobId: id },
      });
      if (existing) return reply.code(201).send(existing);
    }
    const entry = await prisma.timeEntry.create({
      data: {
        jobId: id,
        staffId: parsed.data.staffId,
        opId: parsed.data.opId,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        start: parsed.data.start ? new Date(parsed.data.start) : new Date(),
        end: parsed.data.end ? new Date(parsed.data.end) : null,
      },
    });
    recordAuditEvent(request, {
      action: "time_entry.created",
      entityType: "time_entry",
      entityId: entry.id,
      metadata: { jobId: id, staffId: parsed.data.staffId, start: parsed.data.start },
    });
    return reply.code(201).send(entry);
  });

  app.patch("/:id/time-entries/:entryId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id, entryId } = request.params as { id: string; entryId: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const parsed = parseBody(updateTimeEntrySchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const data: { start?: Date; end?: Date | null; staffId?: string } = {};
    if (parsed.data.staffId) data.staffId = parsed.data.staffId;
    if (parsed.data.start) data.start = new Date(parsed.data.start);
    if (parsed.data.end !== undefined) {
      data.end = parsed.data.end ? new Date(parsed.data.end) : null;
    }
    // Scope the mutation to the already-authorized job. Updating by entry id
    // alone would allow a guessed entry id from another job or tenant to be
    // modified.
    const result = await prisma.timeEntry.updateMany({
      where: { id: entryId, jobId: id },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ message: "Time entry not found" });
    recordAuditEvent(request, {
      action: "time_entry.updated",
      entityType: "time_entry",
      entityId: entryId,
      metadata: { jobId: id, ...parsed.data },
    });
    return prisma.timeEntry.findFirst({ where: { id: entryId, jobId: id } });
  });

  // Photos
  app.post("/:id/photos", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const parsed = parseBody(createPhotoSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    if (process.env.NODE_ENV === "production" && parsed.data.url.startsWith("data:")) {
      return reply.code(400).send({ message: "Production photo uploads must use the signed media upload flow" });
    }
    if (parsed.data.opId) {
      const existing = await prisma.jobPhoto.findFirst({ where: { opId: parsed.data.opId, jobId: id } });
      if (existing) return reply.code(201).send(existing);
    }
    const photo = await prisma.jobPhoto.create({
      data: { ...parsed.data, jobId: id },
    });
    recordAuditEvent(request, {
      action: "photo.created",
      entityType: "photo",
      entityId: photo.id,
      metadata: { jobId: id, label: parsed.data.label },
    });
    return reply.code(201).send(photo);
  });

  app.delete("/:id/photos/:photoId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id, photoId } = request.params as { id: string; photoId: string };
    const result = await prisma.jobPhoto.deleteMany({
      where: { id: photoId, jobId: id },
    });
    if (result.count === 0) return reply.code(404).send({ message: "Photo not found" });
    recordAuditEvent(request, { action: "photo.deleted", entityType: "photo", entityId: photoId, metadata: { jobId: id } });
    return reply.code(204).send();
  });

  // Payment link — Stripe Checkout (test mode by default; live with a secret
  // key configured). Free to use: Stripe charges nothing until a client pays.
  // Service items live local-first on the device, so the client sends the
  // invoice amount; the server validates and caps it defensively.
  app.post("/:id/payment-link", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({ where: { id, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const body = (request.body ?? {}) as { amount?: unknown };
    const rawAmount = Number(body.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 0 || rawAmount > 1_000_000) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Amount must be a number between 0 and 1,000,000",
      });
    }
    const amountCents = Math.round(rawAmount * 100);
    const result = await createCheckoutSession({
      jobId: job.id,
      client: job.client,
      amountCents,
      description: job.scope || `Invoice — ${job.id}`,
    });
    recordAuditEvent(request, { action: "payment_link.created", entityType: "job", entityId: job.id, metadata: { mode: result.mode } });
    return reply.send({ url: result.url, mode: result.mode, configured: result.configured, amount: amountCents / 100, currency: "AUD" });
  });
}

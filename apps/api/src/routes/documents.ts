import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import {
  addDocumentVersionSchema,
  createDocumentSchema,
  createRfiSchema,
  updateDocumentSchema,
  updateRfiSchema,
} from "../schemas/document";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";

/** Roles allowed to record field work — same surface as time entries/photos. */
const FIELD_ROLES = ["technician", "dispatcher", "manager", "admin", "owner"] as const;
/** Roles allowed to mutate the vault (edit metadata, delete, version). */
const OFFICE_ROLES = ["manager", "admin", "owner"] as const;

/** "2026-12-31" → UTC midnight Date, or null. */
function parseExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // ── Documents ────────────────────────────────────────────────────────────

  app.get("/documents", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { jobId } = request.query as { jobId?: string };
    return prisma.jobDocument.findMany({
      where: { orgId, ...(jobId ? { jobId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/documents", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createDocumentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const data = parsed.data;
    if (data.jobId) {
      const job = await prisma.job.findFirst({ where: { id: data.jobId, orgId } });
      if (!job) return reply.code(404).send({ message: "Job not found" });
    }

    const document = await prisma.jobDocument.create({
      data: {
        orgId,
        jobId: data.jobId ?? null,
        name: data.name,
        category: data.category,
        tags: data.tags,
        expiresOn: parseExpiry(data.expiresOn),
        notes: data.notes,
        currentVersion: data.currentVersion,
        versions: data.versions ?? [data.currentVersion],
        createdBy: data.createdBy,
      },
    });
    recordAuditEvent(request, {
      action: "document.created",
      entityType: "document",
      entityId: document.id,
      metadata: { jobId: data.jobId, category: data.category, expiresOn: data.expiresOn ?? null },
    });
    return reply.code(201).send(document);
  });

  app.patch("/documents/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, OFFICE_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateDocumentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const data = parsed.data;
    const result = await prisma.jobDocument.updateMany({
      where: { id, orgId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.expiresOn !== undefined ? { expiresOn: parseExpiry(data.expiresOn) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    if (result.count === 0) return reply.code(404).send({ message: "Document not found" });
    recordAuditEvent(request, { action: "document.updated", entityType: "document", entityId: id, metadata: data });
    return prisma.jobDocument.findFirst({ where: { id, orgId } });
  });

  app.post("/documents/:id/versions", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(addDocumentVersionSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const existing = await prisma.jobDocument.findFirst({ where: { id, orgId } });
    if (!existing) return reply.code(404).send({ message: "Document not found" });

    const versions = Array.isArray(existing.versions) ? existing.versions : [];
    const updated = await prisma.jobDocument.update({
      where: { id },
      data: {
        currentVersion: parsed.data.version,
        versions: [...versions, parsed.data.version],
      },
    });
    recordAuditEvent(request, { action: "document.version_added", entityType: "document", entityId: id });
    return reply.send(updated);
  });

  app.delete("/documents/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, OFFICE_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const result = await prisma.jobDocument.deleteMany({ where: { id, orgId } });
    if (result.count === 0) return reply.code(404).send({ message: "Document not found" });
    // Unlink any RFIs that referenced the deleted document.
    await prisma.rfi.updateMany({ where: { attachmentId: id }, data: { attachmentId: null } });
    recordAuditEvent(request, { action: "document.deleted", entityType: "document", entityId: id });
    return reply.code(204).send();
  });

  // ── RFIs (requests-for-information) ──────────────────────────────────────

  app.get("/jobs/:jobId/rfis", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { jobId } = request.params as { jobId: string };
    const job = await prisma.job.findFirst({ where: { id: jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    return prisma.rfi.findMany({ where: { jobId, orgId }, orderBy: { raisedAt: "desc" } });
  });

  app.post("/jobs/:jobId/rfis", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { jobId } = request.params as { jobId: string };
    const job = await prisma.job.findFirst({ where: { id: jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const parsed = parseBody(createRfiSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    if (parsed.data.attachmentId) {
      const attachment = await prisma.jobDocument.findFirst({
        where: { id: parsed.data.attachmentId, orgId },
      });
      if (!attachment) return reply.code(404).send({ message: "Attached document not found" });
    }

    const rfi = await prisma.rfi.create({
      data: {
        orgId,
        jobId,
        question: parsed.data.question,
        attachmentId: parsed.data.attachmentId ?? null,
        raisedBy: parsed.data.raisedBy,
      },
    });
    recordAuditEvent(request, {
      action: "rfi.raised",
      entityType: "rfi",
      entityId: rfi.id,
      metadata: { jobId },
    });
    return reply.code(201).send(rfi);
  });

  app.patch("/rfis/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, FIELD_ROLES);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateRfiSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const existing = await prisma.rfi.findFirst({ where: { id, orgId } });
    if (!existing) return reply.code(404).send({ message: "RFI not found" });

    const data: { answer?: string; answeredBy?: string; answeredAt?: Date; status?: string } = {};
    if (parsed.data.answer !== undefined) {
      data.answer = parsed.data.answer;
      data.answeredBy = parsed.data.answeredBy ?? request.auth?.userId ?? existing.raisedBy;
      data.answeredAt = new Date();
    }
    if (parsed.data.status === "closed") data.status = "closed";

    const rfi = await prisma.rfi.update({ where: { id }, data });
    recordAuditEvent(request, {
      action: parsed.data.status === "closed" ? "rfi.closed" : "rfi.answered",
      entityType: "rfi",
      entityId: id,
    });
    return reply.send(rfi);
  });
}

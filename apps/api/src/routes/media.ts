import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { createUploadIntentSchema, completeUploadSchema } from "../schemas/media";
import { parseBody, sendValidationError } from "../lib/validation";

const INTENT_TTL_SECONDS = 15 * 60;

function mediaSigningSecret(): string | null {
  return process.env.MEDIA_SIGNING_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function createUploadUrl(objectKey: string, expiresAt: number): string | null {
  const baseUrl = process.env.MEDIA_UPLOAD_BASE_URL?.trim();
  const secret = mediaSigningSecret();
  if (!baseUrl || !secret) return null;
  const encodedKey = encodeObjectKey(objectKey);
  const signature = createHmac("sha256", secret).update(`${objectKey}:${expiresAt}`).digest("base64url");
  return `${baseUrl.replace(/\/$/, "")}/${encodedKey}?expires=${expiresAt}&signature=${signature}`;
}

function publicUrlFor(objectKey: string): string | null {
  const baseUrl = process.env.MEDIA_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/${encodeObjectKey(objectKey)}`;
}

function intentResponse(asset: {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  expiresAt: Date;
}) {
  const uploadUrl = createUploadUrl(asset.objectKey, Math.floor(asset.expiresAt.getTime() / 1000));
  if (!uploadUrl) return null;
  return {
    assetId: asset.id,
    objectKey: asset.objectKey,
    uploadUrl,
    expiresAt: asset.expiresAt.toISOString(),
    headers: { "Content-Type": asset.contentType },
    byteSize: asset.byteSize,
  };
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post("/upload-intents", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["technician", "dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(createUploadIntentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const job = await prisma.job.findFirst({ where: { id: parsed.data.jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });

    const existing = await prisma.mediaAsset.findFirst({ where: { orgId, opId: parsed.data.opId, jobId: job.id } });
    if (existing) {
      if (existing.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ message: "Media upload intent expired" });
      const existingResponse = intentResponse(existing);
      if (!existingResponse) return reply.code(503).send({ message: "Media storage is not configured" });
      return reply.code(200).send(existingResponse);
    }

    const assetId = randomUUID();
    const expiresAt = new Date(Date.now() + INTENT_TTL_SECONDS * 1000);
    const objectKey = `${orgId}/jobs/${job.id}/${assetId}`;
    if (!createUploadUrl(objectKey, Math.floor(expiresAt.getTime() / 1000))) {
      return reply.code(503).send({ message: "Media storage is not configured" });
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        id: assetId,
        orgId,
        jobId: job.id,
        objectKey,
        opId: parsed.data.opId,
        label: parsed.data.label,
        contentType: parsed.data.contentType,
        byteSize: parsed.data.byteSize,
        sha256: parsed.data.sha256,
        expiresAt,
      },
    });
    recordAuditEvent(request, {
      action: "media.intent_created",
      entityType: "media_asset",
      entityId: asset.id,
      metadata: { jobId: job.id, contentType: asset.contentType, byteSize: asset.byteSize },
    });

    const response = intentResponse(asset);
    if (!response) return reply.code(503).send({ message: "Media storage is not configured" });
    return reply.code(201).send(response);
  });

  app.post("/:assetId/complete", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["technician", "dispatcher", "manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;

    const { assetId } = request.params as { assetId: string };
    const parsed = parseBody(completeUploadSchema, { assetId });
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, orgId } });
    if (!asset) return reply.code(404).send({ message: "Media asset not found" });
    if (asset.status === "uploaded" && asset.publicUrl) return { assetId: asset.id, photoUrl: asset.publicUrl };
    if (asset.status !== "pending") return reply.code(409).send({ message: "Media asset cannot be completed" });
    if (asset.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ message: "Media upload intent expired" });

    const publicUrl = publicUrlFor(asset.objectKey);
    if (!publicUrl) return reply.code(503).send({ message: "Media public URL is not configured" });
    const updated = await prisma.mediaAsset.updateMany({
      where: { id: asset.id, orgId, status: "pending" },
      data: { status: "uploaded", publicUrl },
    });
    if (updated.count === 0) return reply.code(409).send({ message: "Media asset was completed concurrently" });

    const existingPhoto = await prisma.jobPhoto.findFirst({ where: { assetId: asset.id, jobId: asset.jobId } });
    const photo = existingPhoto ?? await prisma.jobPhoto.create({
      data: { jobId: asset.jobId, assetId: asset.id, label: asset.label, url: publicUrl },
    });
    recordAuditEvent(request, {
      action: "media.completed",
      entityType: "media_asset",
      entityId: asset.id,
      metadata: { jobId: asset.jobId, photoId: photo.id },
    });
    return { assetId: asset.id, photoId: photo.id, photoUrl: publicUrl };
  });
}

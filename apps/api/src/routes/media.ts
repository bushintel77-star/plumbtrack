import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { createUploadIntentSchema, completeUploadSchema } from "../schemas/media";
import { parseBody, sendValidationError } from "../lib/validation";
import { createUploadUrl, readObject, storageConfigured } from "../lib/storage";

const INTENT_TTL_SECONDS = 15 * 60;

/** Absolute photo read URL for the API-served read route. The asset cuid is
 *  the unguessable capability token; the URL is built from the request's
 *  host so HQ `<img>` and mobile `<Image>` can load it cross-origin. */
function readUrlFor(request: FastifyRequest, assetId: string): string {
  const proto = request.protocol === "https" || request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = (request.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ?? request.headers.host ?? "localhost:8080";
  return `${proto}://${host}/api/media/${assetId}/file`;
}

async function intentResponse(asset: {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  expiresAt: Date;
}) {
  const uploadUrl = await createUploadUrl(asset.objectKey, asset.contentType);
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
      const existingResponse = await intentResponse(existing);
      if (!existingResponse) return reply.code(503).send({ message: "Media storage is not configured" });
      return reply.code(200).send(existingResponse);
    }

    const assetId = randomUUID();
    const expiresAt = new Date(Date.now() + INTENT_TTL_SECONDS * 1000);
    const objectKey = `${orgId}/jobs/${job.id}/${assetId}`;
    if (!storageConfigured()) {
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

    const response = await intentResponse(asset);
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

    // Reads are served by the API itself — no public bucket URL needed.
    const publicUrl = readUrlFor(request, asset.id);
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

  // Public read route — the browser <img>/<Image> tags load this without auth
  // headers. The asset cuid is an unguessable capability token; the tenant
  // hook exempts this path like /api/stream. Streams the object from storage.
  app.get("/:assetId/file", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, status: "uploaded" } });
    if (!asset) return reply.code(404).send({ message: "Media asset not found" });
    const object = await readObject(asset.objectKey);
    if (!object) return reply.code(404).send({ message: "Media object not found" });
    const contentType = object.contentType ?? asset.contentType ?? "application/octet-stream";
    return reply
      .code(200)
      .header("Content-Type", contentType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(Buffer.from(object.body));
  });
}

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { createUploadIntentSchema, completeUploadSchema } from "../schemas/media";
import { parseBody, sendValidationError } from "../lib/validation";
import { createUploadUrl, readObject, storageConfigured, MEDIA_URL_TTL_SECONDS, verifyMediaReadSignature } from "../lib/storage";
import { signedMediaReadUrl } from "../lib/mediaUrls";

const INTENT_TTL_SECONDS = 15 * 60;

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
    const body = (request.body ?? {}) as { purpose?: unknown };
    const parsed = parseBody(completeUploadSchema, { assetId, ...(body.purpose !== undefined ? { purpose: body.purpose } : {}) });
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const purpose = parsed.data.purpose ?? "photo";
    const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, orgId } });
    if (!asset) return reply.code(404).send({ message: "Media asset not found" });
    if (asset.status === "uploaded" && asset.publicUrl) {
      // Replay of a completed upload: return the SAME photo id the first
      // call minted. Omitting it forced the client to generate a fresh
      // random photo id and broke id stability across retries.
      const photo = await prisma.jobPhoto.findFirst({ where: { assetId: asset.id, jobId: asset.jobId } });
      return { assetId: asset.id, photoId: photo?.id ?? null, photoUrl: asset.publicUrl, fileUrl: asset.publicUrl };
    }
    if (asset.status !== "pending") return reply.code(409).send({ message: "Media asset cannot be completed" });
    if (asset.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ message: "Media upload intent expired" });

    // Reads are served by the API itself — no public bucket URL needed.
    // Reads are served by the API itself — no public bucket URL needed, and
    // the URL is SIGNED (P1-6): it expires, so a leaked link dies.
    const publicUrl = signedMediaReadUrl(request, asset.id);
    if (!publicUrl) return reply.code(503).send({ message: "Media public URL is not configured (set PUBLIC_API_BASE_URL)" });
    const updated = await prisma.mediaAsset.updateMany({
      where: { id: asset.id, orgId, status: "pending" },
      data: { status: "uploaded", publicUrl },
    });
    if (updated.count === 0) return reply.code(409).send({ message: "Media asset was completed concurrently" });

    if (purpose === "document") {
      recordAuditEvent(request, {
        action: "media.completed",
        entityType: "media_asset",
        entityId: asset.id,
        metadata: { jobId: asset.jobId, purpose },
      });
      return { assetId: asset.id, fileUrl: publicUrl };
    }

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
  // headers. The URL is SIGNED (P1-6): the query carries expires + HMAC over
  // the asset id, verified timing-safe below; an unsigned, tampered or
  // expired request gets 403, so a leaked link dies with its TTL. The
  // tenant hook exempts this path — the signature IS the authorization.
  app.get("/:assetId/file", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const query = request.query as { expires?: string; signature?: string };
    if (!verifyMediaReadSignature(assetId, query.expires, query.signature)) {
      return reply.code(403).send({ message: "Invalid or expired media link — reload to get a fresh one" });
    }
    const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, status: "uploaded" } });
    if (!asset) return reply.code(404).send({ message: "Media asset not found" });
    const object = await readObject(asset.objectKey);
    if (!object) return reply.code(404).send({ message: "Media object not found" });
    const contentType = object.contentType ?? asset.contentType ?? "application/octet-stream";
    return reply
      .code(200)
      .header("Content-Type", contentType)
      // Cacheable only for a fraction of the URL's life — the signed URL
      // dies, so a year-immutable header would lie.
      .header("Cache-Control", `private, max-age=${Math.min(3600, MEDIA_URL_TTL_SECONDS)}`)
      .send(Buffer.from(object.body));
  });
}

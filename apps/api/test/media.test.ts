import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { findFirstJob, createAsset, findFirstAsset, updateAsset, findFirstPhoto, createPhoto } = vi.hoisted(() => ({
  findFirstJob: vi.fn(),
  createAsset: vi.fn(),
  findFirstAsset: vi.fn(),
  updateAsset: vi.fn(),
  findFirstPhoto: vi.fn(),
  createPhoto: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: findFirstJob },
    mediaAsset: { create: createAsset, findFirst: findFirstAsset, updateMany: updateAsset },
    jobPhoto: { findFirst: findFirstPhoto, create: createPhoto },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org-caulfield";
const JOB = { id: "J-1", orgId: ORG };

function intentPayload() {
  return { jobId: "J-1", opId: "photo-op-1", label: "Before", contentType: "image/jpeg", byteSize: 1024 };
}

describe("secure media upload contract", () => {
  let app: FastifyInstance;
  const previousUploadBase = process.env.MEDIA_UPLOAD_BASE_URL;
  const previousPublicBase = process.env.MEDIA_PUBLIC_BASE_URL;
  const previousAuthSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = "media-test-secret";
    process.env.MEDIA_UPLOAD_BASE_URL = "https://uploads.example.test/put";
    process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.test";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousUploadBase === undefined) delete process.env.MEDIA_UPLOAD_BASE_URL;
    else process.env.MEDIA_UPLOAD_BASE_URL = previousUploadBase;
    if (previousPublicBase === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = previousPublicBase;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findFirstJob.mockResolvedValue(JOB);
    createAsset.mockResolvedValue({
      id: "asset-1",
      orgId: ORG,
      jobId: "J-1",
      objectKey: `${ORG}/jobs/J-1/asset-1`,
      opId: "photo-op-1",
      label: "Before",
      contentType: "image/jpeg",
      byteSize: 1024,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });
    findFirstAsset.mockResolvedValue(null);
    updateAsset.mockResolvedValue({ count: 1 });
    findFirstPhoto.mockResolvedValue(null);
    createPhoto.mockResolvedValue({ id: "photo-1", jobId: "J-1", assetId: "asset-1" });
  });

  it("creates an expiring signed upload intent for a job in the caller organization", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/media/upload-intents",
      headers: { "x-organization-id": ORG },
      payload: intentPayload(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assetId: "asset-1",
      objectKey: `${ORG}/jobs/J-1/asset-1`,
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(response.json().uploadUrl).toContain("signature=");
    expect(createAsset).toHaveBeenCalledWith({ data: expect.objectContaining({ orgId: ORG, jobId: "J-1", opId: "photo-op-1" }) });
  });

  it("does not create metadata when storage signing is not configured", async () => {
    delete process.env.MEDIA_UPLOAD_BASE_URL;
    const response = await app.inject({
      method: "POST",
      url: "/api/media/upload-intents",
      headers: { "x-organization-id": ORG },
      payload: intentPayload(),
    });
    process.env.MEDIA_UPLOAD_BASE_URL = "https://uploads.example.test/put";

    expect(response.statusCode).toBe(503);
    expect(createAsset).not.toHaveBeenCalled();
  });

  it("completes an owned asset and creates its job photo from the configured public URL", async () => {
    findFirstAsset.mockResolvedValue({
      id: "asset-1",
      orgId: ORG,
      jobId: "J-1",
      objectKey: `${ORG}/jobs/J-1/asset-1`,
      label: "Before",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/media/asset-1/complete",
      headers: { "x-organization-id": ORG },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      assetId: "asset-1",
      photoId: "photo-1",
      // Reads are served by the API itself — the stored URL points at the
      // media file-read route on the request host, no public bucket needed.
      photoUrl: expect.stringMatching(/\/api\/media\/asset-1\/file$/),
    });
    expect(createPhoto).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "J-1", assetId: "asset-1", label: "Before" }),
    });
  });

  it("cannot complete an asset from another organization", async () => {
    findFirstAsset.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/media/asset-1/complete",
      headers: { "x-organization-id": "other-org" },
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    expect(updateAsset).not.toHaveBeenCalled();
  });

  it("issues a real SigV4 pre-signed PUT URL when R2/S3 storage is configured", async () => {
    // Route-level: point the API at an S3-compatible endpoint and expect the
    // upload URL to be a genuine AWS SigV4 URL (X-Amz-Signature + query
    // params), not the legacy HMAC gateway signature.
    process.env.MEDIA_STORAGE_ENDPOINT = "https://abc123.r2.cloudflarestorage.com";
    process.env.MEDIA_STORAGE_BUCKET = "plumbtrack-media";
    process.env.MEDIA_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.MEDIA_STORAGE_REGION = "auto";

    const response = await app.inject({
      method: "POST",
      url: "/api/media/upload-intents",
      headers: { "x-organization-id": ORG },
      payload: intentPayload(),
    });

    delete process.env.MEDIA_STORAGE_ENDPOINT;
    delete process.env.MEDIA_STORAGE_BUCKET;
    delete process.env.MEDIA_STORAGE_ACCESS_KEY_ID;
    delete process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY;
    delete process.env.MEDIA_STORAGE_REGION;

    expect(response.statusCode).toBe(201);
    const { uploadUrl } = response.json() as { uploadUrl: string };
    expect(uploadUrl).toContain("X-Amz-Signature=");
    expect(uploadUrl).toContain("X-Amz-Credential=");
    expect(uploadUrl).toContain("plumbtrack-media");
  });
});

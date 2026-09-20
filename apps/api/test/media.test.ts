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

// This suite's subject is the URL/signature layer, not storage I/O (the
// real-bytes round trip lives in mediaRoundTrip.test.ts). Gateway mode has
// no API-side read path, so double readObject at the module boundary —
// everything else in lib/storage stays real.
vi.mock("../src/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/storage")>()),
  readObject: vi.fn(async () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" })),
}));

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

  describe("signed read URLs (P1-6)", () => {
    /** The stored-object plumbing under /file — before complete it is
     *  "pending" (minting); after complete it is "uploaded" (reading). */
    function uploadedAsset(status: "pending" | "uploaded" = "pending") {
      findFirstAsset.mockResolvedValue({
        id: "asset-1",
        orgId: ORG,
        jobId: "J-1",
        objectKey: `${ORG}/jobs/J-1/asset-1`,
        contentType: "image/jpeg",
        byteSize: 1024,
        status,
        expiresAt: new Date(Date.now() + 60_000),
      });
    }

    it("mint URLs carry an expiry + signature", async () => {
      uploadedAsset();
      const mint = await app.inject({
        method: "POST",
        url: "/api/media/asset-1/complete",
        headers: { "x-organization-id": ORG },
        payload: {},
      });
      expect(mint.statusCode, mint.body).toBe(200);
      expect(mint.json().photoUrl).toMatch(/\?expires=\d+&signature=[A-Za-z0-9_-]+$/);
    });

    it("/file serves a validly-signed request", async () => {
      uploadedAsset();
      const mint = await app.inject({
        method: "POST",
        url: "/api/media/asset-1/complete",
        headers: { "x-organization-id": ORG },
        payload: {},
      });
      expect(mint.statusCode, mint.body).toBe(200);
      const signed = new URL(mint.json().photoUrl as string);
      uploadedAsset("uploaded");
      const res = await app.inject({
        method: "GET",
        url: `/api/media/asset-1/file${signed.search}`,
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers["cache-control"]).toMatch(/private/);
    });

    it("/file 403s an unsigned request, a tampered signature and an expired link", async () => {
      uploadedAsset();
      const mint = await app.inject({
        method: "POST",
        url: "/api/media/asset-1/complete",
        headers: { "x-organization-id": ORG },
        payload: {},
      });
      const signed = new URL(mint.json().photoUrl as string);
      const expires = signed.searchParams.get("expires")!;

      const unsigned = await app.inject({ method: "GET", url: "/api/media/asset-1/file" });
      expect(unsigned.statusCode).toBe(403);

      const tampered = await app.inject({
        method: "GET",
        url: `/api/media/asset-1/file?expires=${expires}&signature=${"A".repeat(43)}b`,
      });
      expect(tampered.statusCode).toBe(403);

      const expired = await app.inject({
        method: "GET",
        url: `/api/media/asset-1/file?expires=${Math.floor(Date.now() / 1000) - 10}&signature=nope`,
      });
      expect(expired.statusCode).toBe(403);
    });
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
      // Reads are served by the API itself, and the URL is SIGNED (P1-6):
      // the stored URL points at the media file-read route with an expiry
      // + signature, no public bucket needed.
      photoUrl: expect.stringMatching(/\/api\/media\/asset-1\/file\?expires=\d+&signature=/),
    });
    expect(createPhoto).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "J-1", assetId: "asset-1", label: "Before" }),
    });
  });

  it("returns the existing photoId when complete is retried on an already-uploaded asset", async () => {
    // A retried complete must replay the SAME photo id the first call
    // minted — omitting it forced the client to generate a fresh random
    // photo id and broke id stability across retries.
    findFirstAsset.mockResolvedValue({
      id: "asset-1",
      orgId: ORG,
      jobId: "J-1",
      objectKey: `${ORG}/jobs/J-1/asset-1`,
      label: "Before",
      status: "uploaded",
      publicUrl: "https://api.example.test/api/media/asset-1/file",
      expiresAt: new Date(Date.now() + 60_000),
    });
    findFirstPhoto.mockResolvedValue({ id: "photo-1", jobId: "J-1", assetId: "asset-1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/media/asset-1/complete",
      headers: { "x-organization-id": ORG },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ assetId: "asset-1", photoId: "photo-1" });
    expect(findFirstPhoto).toHaveBeenCalledWith({ where: { assetId: "asset-1", jobId: "J-1" } });
    expect(updateAsset).not.toHaveBeenCalled();
    expect(createPhoto).not.toHaveBeenCalled();
  });

  it("completes a document upload without recording it as photo evidence", async () => {
    findFirstAsset.mockResolvedValue({
      id: "asset-2",
      orgId: ORG,
      jobId: "J-1",
      objectKey: `${ORG}/jobs/J-1/asset-2`,
      label: "Gas compliance cert",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/media/asset-2/complete",
      headers: { "x-organization-id": ORG },
      payload: { purpose: "document" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ assetId: "asset-2", fileUrl: expect.stringMatching(/\/api\/media\/asset-2\/file\?expires=\d+&signature=/) });
    expect(updateAsset).toHaveBeenCalled();
    expect(createPhoto).not.toHaveBeenCalled();
  });

  it("rejects an unknown completion purpose", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/media/asset-2/complete",
      headers: { "x-organization-id": ORG },
      payload: { purpose: "avatar" },
    });
    expect(response.statusCode).toBe(400);
    expect(findFirstAsset).not.toHaveBeenCalled();
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

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * P1-8 — the zero-mock media round trip. REAL bytes on REAL disk over the
 * API's own signed PUT route: upload-intent → HMAC-signed PUT → complete
 * (which reads the object back and verifies size + declared sha256 before
 * declaring success) → GET file returns the exact bytes. The database is an
 * in-memory table because the subject here is the storage contract, not the
 * persistence layer.
 */

const assets = new Map<string, Record<string, unknown>>();
const photos: Array<Record<string, unknown>> = [];

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: vi.fn(async ({ where }: { where: { id: string; orgId: string } }) => ({ id: where.id, orgId: where.orgId })) },
    mediaAsset: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // The DB column default ("pending") applied on create.
        const row = { status: "pending", ...data };
        assets.set(String(data.id), row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of assets.values()) {
          if (where.id !== undefined && row.id !== where.id) continue;
          if (where.orgId !== undefined && row.orgId !== where.orgId) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          if (where.opId !== undefined && row.opId !== where.opId) continue;
          return row;
        }
        return null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; orgId: string; status: string }; data: Record<string, unknown> }) => {
        const row = assets.get(where.id);
        if (!row || row.orgId !== where.orgId || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    jobPhoto: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        photos.find(photo => photo.assetId === where.assetId) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const photo = { id: `photo-${photos.length + 1}`, ...data };
        photos.push(photo);
        return photo;
      }),
    },
    auditEvent: { create: vi.fn(async () => ({})) },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";

const ORG = "org-media-roundtrip";
// Minted lazily (inside tests, after beforeAll sets AUTH_SECRET) so signing
// and verification see the same secret.
const bearer = () =>
  `Bearer ${issueAuthToken({ userId: "user-tech", organizationId: ORG, role: "technician" })}`;

// Deterministic fake JPEG bytes (real binary content, not a text stand-in).
const IMAGE_BYTES = Uint8Array.from({ length: 2048 }, (_, i) => (i * 31 + 7) % 256);
const IMAGE_SHA = createHash("sha256").update(IMAGE_BYTES).digest("hex");

let app: FastifyInstance;
let storageDir: string;
const previousEnv: Record<string, string | undefined> = {};

async function createIntent(byteSize = IMAGE_BYTES.byteLength, sha256 = IMAGE_SHA as string | undefined): Promise<{ assetId: string; uploadUrl: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/media/upload-intents",
    headers: { authorization: bearer() },
    payload: { jobId: "job-1", opId: `op-${randomUUID()}`, label: "Before", contentType: "image/jpeg", byteSize, sha256 },
  });
  expect(res.statusCode, res.body).toBe(201);
  return { assetId: res.json().assetId, uploadUrl: res.json().uploadUrl as string };
}

/** Real HTTP listener for binary reads (inject stringifies bodies). */
async function listenOnEphemeralPort(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  return `http://127.0.0.1:${address.port}`;
}

describe("zero-mock media round trip (local disk storage)", () => {
  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "plumbtrack-media-"));
    previousEnv.MEDIA_STORAGE_DIR = process.env.MEDIA_STORAGE_DIR;
    previousEnv.MEDIA_UPLOAD_BASE_URL = process.env.MEDIA_UPLOAD_BASE_URL;
    previousEnv.AUTH_SECRET = process.env.AUTH_SECRET;
    process.env.MEDIA_STORAGE_DIR = storageDir;
    delete process.env.MEDIA_UPLOAD_BASE_URL; // local mode, not the legacy gateway
    process.env.AUTH_SECRET = "media-roundtrip-secret";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (previousEnv.MEDIA_STORAGE_DIR === undefined) delete process.env.MEDIA_STORAGE_DIR;
    else process.env.MEDIA_STORAGE_DIR = previousEnv.MEDIA_STORAGE_DIR;
    if (previousEnv.MEDIA_UPLOAD_BASE_URL === undefined) delete process.env.MEDIA_UPLOAD_BASE_URL;
    else process.env.MEDIA_UPLOAD_BASE_URL = previousEnv.MEDIA_UPLOAD_BASE_URL;
    if (previousEnv.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousEnv.AUTH_SECRET;
    await rm(storageDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    assets.clear();
    photos.length = 0;
  });

  it("intent → signed PUT → verified complete → GET serves the exact bytes", async () => {
    const { assetId, uploadUrl } = await createIntent();
    expect(uploadUrl).toMatch(/^\/api\/media\/local\//);
    expect(uploadUrl).toMatch(/expires=\d+&signature=/);

    const put = await app.inject({
      method: "PUT",
      url: uploadUrl,
      headers: { "content-type": "image/jpeg" },
      payload: Buffer.from(IMAGE_BYTES),
    });
    expect(put.statusCode, put.body).toBe(200);

    const complete = await app.inject({
      method: "POST",
      url: `/api/media/${assetId}/complete`,
      headers: { authorization: bearer() },
      payload: {},
    });
    expect(complete.statusCode, complete.body).toBe(200);
    expect(complete.json()).toMatchObject({ assetId, photoId: "photo-1" });

    // Real HTTP for the binary read — light-my-request stringifies the body,
    // which would corrupt arbitrary bytes.
    const base = await listenOnEphemeralPort(app);
    const file = await fetch(`${base}/api/media/${assetId}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    const served = new Uint8Array(await file.arrayBuffer());
    expect(Buffer.compare(Buffer.from(served), Buffer.from(IMAGE_BYTES))).toBe(0);
  });

  it("complete refuses bytes that do not match the declared sha256", async () => {
    const { assetId, uploadUrl } = await createIntent();
    const tampered = Uint8Array.from({ length: IMAGE_BYTES.byteLength }, (_, i) => (i * 17 + 3) % 256);
    const put = await app.inject({ method: "PUT", url: uploadUrl, headers: { "content-type": "image/jpeg" }, payload: Buffer.from(tampered) });
    expect(put.statusCode, put.body).toBe(200);
    const complete = await app.inject({ method: "POST", url: `/api/media/${assetId}/complete`, headers: { authorization: bearer() }, payload: {} });
    expect(complete.statusCode, complete.body).toBe(422);
    expect(complete.json().message).toMatch(/content hash/i);
    // The asset stays pending — nothing was faked into "uploaded".
    expect(assets.get(assetId)?.status).toBe("pending");
  });

  it("complete refuses a size mismatch and a never-PUT asset", async () => {
    const wrongSize = await createIntent(IMAGE_BYTES.byteLength, undefined);
    const shortPut = await app.inject({ method: "PUT", url: wrongSize.uploadUrl, headers: { "content-type": "image/jpeg" }, payload: Buffer.from(IMAGE_BYTES.slice(0, 512)) });
    expect(shortPut.statusCode, shortPut.body).toBe(200);
    const sized = await app.inject({ method: "POST", url: `/api/media/${wrongSize.assetId}/complete`, headers: { authorization: bearer() }, payload: {} });
    expect(sized.statusCode, sized.body).toBe(422);
    expect(sized.json().message).toMatch(/bytes but the intent declared/i);

    const untouched = await createIntent();
    const never = await app.inject({ method: "POST", url: `/api/media/${untouched.assetId}/complete`, headers: { authorization: bearer() }, payload: {} });
    expect(never.statusCode, never.body).toBe(409);
    expect(never.json().message).toMatch(/never reached storage/i);
  });

  it("the signed PUT rejects a tampered signature", async () => {
    const { uploadUrl } = await createIntent();
    const tampered = uploadUrl.replace(/signature=./, "signature=X");
    const put = await app.inject({ method: "PUT", url: tampered, headers: { "content-type": "image/jpeg" }, payload: Buffer.from(IMAGE_BYTES) });
    expect(put.statusCode).toBe(403);
  });
});

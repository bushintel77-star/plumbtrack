import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object-storage URL factory. Three modes:
 *
 * 1. R2 / S3-compatible (production) — when `MEDIA_STORAGE_ENDPOINT`,
 *    `MEDIA_STORAGE_BUCKET`, `MEDIA_STORAGE_ACCESS_KEY_ID` and
 *    `MEDIA_STORAGE_SECRET_ACCESS_KEY` are all set, this returns a REAL
 *    SigV4 pre-signed PUT URL (what Cloudflare R2 and AWS S3 both accept),
 *    plus a plain public URL for reading. This is the provider decision
 *    (R2 chosen) implemented provider-agnostically: any S3-compatible store
 *    works by swapping the endpoint.
 *
 * 2. Local directory (dev/test) — `MEDIA_STORAGE_DIR` names a real folder;
 *    uploads PUT to an HMAC-signed internal route that writes the bytes to
 *    disk, and reads stream them back. Real bytes, real HTTP, real disk —
 *    the media flow runs end-to-end with no cloud credentials and no fakes.
 *    Ignored in production (fail closed to S3/gateway config there).
 *
 * 3. HMAC gateway (legacy dev/test) — MEDIA_UPLOAD_BASE_URL + HMAC
 *    signature, verified by a self-hosted gateway. Retained so existing
 *    local fixtures keep working; note this mode has no API-side read path
 *    (the gateway owns the bytes), so complete-then-read needs mode 1 or 2.
 *
 * The upload contract itself (upload-intent → PUT → complete) is unchanged;
 * only the URL signing strategy differs.
 */

const TTL_SECONDS = 15 * 60;

/** Local storage root — dev/test only; production must configure S3/R2 or
 *  the gateway so the deployment fails loudly instead of writing to a
 *  container's ephemeral disk. */
function localDir(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const dir = process.env.MEDIA_STORAGE_DIR?.trim();
  return dir || null;
}

function s3Client(): S3Client | null {
  const endpoint = process.env.MEDIA_STORAGE_ENDPOINT?.trim();
  const bucket = process.env.MEDIA_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.MEDIA_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint,
    region: process.env.MEDIA_STORAGE_REGION?.trim() || "auto",
    credentials: { accessKeyId, secretAccessKey },
    // R2 requires path-style addressing; S3 buckets with dots do too.
    forcePathStyle: true
  });
}

function signingSecret(): string | null {
  return process.env.MEDIA_SIGNING_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

export function storageConfigured(): boolean {
  return s3Client() !== null || Boolean(process.env.MEDIA_UPLOAD_BASE_URL?.trim()) || localDir() !== null;
}

/** Which mode owns object READS: "s3" and "local" are readable by the API
 *  (completion can verify stored bytes against the intent); "gateway" keeps
 *  the bytes on the separate self-hosted gateway (verification impossible —
 *  complete trusts the gateway contract there); "none" is unconfigured. */
export function storageReadMode(): "s3" | "local" | "gateway" | "none" {
  if (localDir()) return "local";
  if (s3Client()) return "s3";
  if (process.env.MEDIA_UPLOAD_BASE_URL?.trim()) return "gateway";
  return "none";
}

/** HMAC for the signed-PUT URLs (local mode and legacy gateway share the
 *  scheme: `objectKey:expires` over the signing secret). */
export function signUploadPath(objectKey: string, expiresAt: number): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const signature = createHmac("sha256", secret).update(`${objectKey}:${expiresAt}`).digest("base64url");
  return `/api/media/local/${encodeObjectKey(objectKey)}?expires=${expiresAt}&signature=${signature}`;
}

/** Verify a signed-PUT request the local route received — timing-safe, same
 *  scheme the real gateway applies. */
export function verifyLocalUploadSignature(objectKey: string, expires: string | undefined, signature: string | undefined): boolean {
  const secret = signingSecret();
  const expiresAt = Number(expires);
  if (!secret || !signature || !Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return false;
  const expected = createHmac("sha256", secret).update(`${objectKey}:${expiresAt}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Write bytes into the local storage root (mode 2). Refuses path escape —
 *  the key is server-generated, but the route verifies before writing. */
export async function putLocalObject(objectKey: string, body: Uint8Array): Promise<void> {
  const dir = localDir();
  if (!dir) throw new Error("Local media storage is not configured");
  const target = join(dir, objectKey);
  if (!target.startsWith(dir)) throw new Error("Invalid object key");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
}

/** A pre-signed PUT URL the client can upload the object to, or null when
 *  no storage backend is configured. Local mode returns a signed PATH (the
 *  client resolves it against the API origin). */
export async function createUploadUrl(objectKey: string, contentType: string): Promise<string | null> {
  const dir = localDir();
  if (dir) {
    return signUploadPath(objectKey, Math.floor(Date.now() / 1000) + TTL_SECONDS);
  }

  const client = s3Client();
  if (client) {
    const bucket = process.env.MEDIA_STORAGE_BUCKET!.trim();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      // Content-length is enforced client-side; not baked into the signature
      // so a retry with the same key stays valid within the TTL.
    });
    return getSignedUrl(client, command, { expiresIn: TTL_SECONDS });
  }

  // Legacy HMAC gateway fallback.
  const baseUrl = process.env.MEDIA_UPLOAD_BASE_URL?.trim();
  const secret = signingSecret();
  if (!baseUrl || !secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const signature = createHmac("sha256", secret).update(`${objectKey}:${expiresAt}`).digest("base64url");
  return `${baseUrl.replace(/\/$/, "")}/${encodeObjectKey(objectKey)}?expires=${expiresAt}&signature=${signature}`;
}

/** Stream an object's bytes from storage (the API serves reads itself, so no
 *  public bucket URL is needed). Returns null when storage is unconfigured or
 *  the object is missing. Local mode reads the real file from disk. */
export async function readObject(objectKey: string): Promise<{ body: Uint8Array; contentType: string | null } | null> {
  const dir = localDir();
  if (dir) {
    try {
      const target = join(dir, objectKey);
      if (!target.startsWith(dir)) return null;
      return { body: new Uint8Array(await readFile(target)), contentType: null };
    } catch {
      return null;
    }
  }

  const client = s3Client();
  if (!client) return null;
  const bucket = process.env.MEDIA_STORAGE_BUCKET?.trim();
  if (!bucket) return null;
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    const contentType = typeof result.ContentType === "string" ? result.ContentType : null;
    return { body: bytes, contentType };
  } catch {
    return null;
  }
}

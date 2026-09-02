import { createHmac } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object-storage URL factory. Two modes:
 *
 * 1. R2 / S3-compatible (production) — when `MEDIA_STORAGE_ENDPOINT`,
 *    `MEDIA_STORAGE_BUCKET`, `MEDIA_STORAGE_ACCESS_KEY_ID` and
 *    `MEDIA_STORAGE_SECRET_ACCESS_KEY` are all set, this returns a REAL
 *    SigV4 pre-signed PUT URL (what Cloudflare R2 and AWS S3 both accept),
 *    plus a plain public URL for reading. This is the provider decision
 *    (R2 chosen) implemented provider-agnostically: any S3-compatible store
 *    works by swapping the endpoint.
 *
 * 2. HMAC gateway (dev/test) — the legacy path: MEDIA_UPLOAD_BASE_URL +
 *    HMAC signature, verified by a self-hosted gateway. Retained so local
 *    and test fixtures keep working without cloud credentials.
 *
 * The upload contract itself (upload-intent → PUT → complete) is unchanged;
 * only the URL signing strategy differs.
 */

const TTL_SECONDS = 15 * 60;

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
  return s3Client() !== null || Boolean(process.env.MEDIA_UPLOAD_BASE_URL?.trim());
}

/** A pre-signed PUT URL the client can upload the object to, or null when
 *  no storage backend is configured. */
export async function createUploadUrl(objectKey: string, contentType: string): Promise<string | null> {
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
 *  the object is missing. */
export async function readObject(objectKey: string): Promise<{ body: Uint8Array; contentType: string | null } | null> {
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

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Credential encryption at rest (AES-256-GCM).
 *
 * Integration access tokens, refresh tokens, API keys and OAuth code verifiers
 * are stored encrypted with a key that lives only in the server environment
 * (`APP_ENCRYPTION_KEY`, 32 bytes base64). A database dump alone therefore
 * carries no usable credential.
 *
 * Format: `v1.<iv base64url>.<authTag base64url>.<ciphertext base64url>` —
 * versioned so a future key rotation can decrypt old rows and re-encrypt.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionUnavailableError";
  }
}

function readKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  return key.length === KEY_BYTES ? key : null;
}

/** True when this deployment can store integration credentials. */
export function encryptionConfigured(): boolean {
  return readKey() !== null;
}

function requireKey(): Buffer {
  const key = readKey();
  if (!key) {
    throw new EncryptionUnavailableError(
      "APP_ENCRYPTION_KEY is not configured (32 bytes, base64) — integration credentials cannot be stored",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const key = requireKey();
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new EncryptionUnavailableError("Stored credential is not in the expected format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Fail fast rather than booting a production deployment that can accept an
 *  API key it cannot encrypt. */
export function assertEncryptionConfiguration(): void {
  if (process.env.NODE_ENV === "production" && !encryptionConfigured()) {
    throw new Error("APP_ENCRYPTION_KEY must be configured in production (32 bytes, base64)");
  }
}

/** Last four characters of a key, for "ending in ••••4821" confirmations. */
export function secretHint(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

/** Constant-time compare for opaque tokens (webhook secrets, callbacks). */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

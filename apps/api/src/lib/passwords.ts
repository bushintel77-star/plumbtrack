import argon2 from "argon2";

/**
 * Password hashing — argon2id with the library's tuned defaults (64 MiB,
 * 3 iterations, 4 lanes). Hashes are self-describing (`$argon2id$v=19$…`)
 * so a parameter bump later rehashes on next successful login if needed.
 *
 * Never log, audit, or return a plaintext password or its hash.
 */

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed stored hash — treat as a failed verification, never a crash.
    return false;
  }
}

/** Minimum length + a few known-weak patterns. Deliberately light — pass
 *  phrases are encouraged, composition rules are not. */
export const PASSWORD_MIN_LENGTH = 10;

const WEAK_PATTERNS = [
  /^password/i,
  /^qwerty/i,
  /^letmein/i,
  /^welcome/i,
  /^admin/i,
  /^(\d+)$/, // all digits (e.g. a phone number)
  /^(.)\1+$/, // one repeated character
];

export function passwordProblem(plain: string): string | null {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (WEAK_PATTERNS.some(pattern => pattern.test(plain))) {
    return "That password is too easy to guess — try a longer phrase.";
  }
  return null;
}

import { prisma, type Session } from "@plumbtrack/database";
import type { OrganizationRole } from "./auth";

/**
 * Per-device session store. The bearer token carries the row id as `sid`;
 * the tenant hook re-reads the row on EVERY request — deliberately no
 * cache, because a TTL'd cache is exactly the revocation lag this store
 * exists to remove. An indexed PK read is noise next to what each request
 * already queries.
 *
 * The row's `role` is authoritative at request time (the token's copy is
 * ignored), so a role change applies on the next request, and `revokedAt`
 * is how sign-out, member removal and invite loss actually log someone
 * out.
 */

/** lastSeenAt is a coarse "still around" signal, not an audit log — writing
 *  it on every request would turn all reads into writes, so updates land at
 *  most once per this floor. */
const TOUCH_FLOOR_MS = 5 * 60 * 1000;

export async function createSession(input: {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  expiresInSeconds: number;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ id: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      expiresAt: new Date(expiresAt * 1000),
      lastSeenAt: new Date(),
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    },
  });
  return { id: session.id, expiresAt };
}

/** The row behind a presented `sid`, or null when it doesn't exist, is
 *  revoked, or its expiry has passed — all indistinguishable to the caller. */
export async function loadActiveSession(id: string): Promise<Session | null> {
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return session;
}

/** Fire-and-forget activity stamp. updateMany with the floor in the WHERE
 *  means this is a write at most once per TOUCH_FLOOR_MS per session, and
 *  never an error to the caller — a stale or vanished row is a no-op. */
export async function touchSession(id: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id, lastSeenAt: { lt: new Date(Date.now() - TOUCH_FLOOR_MS) } },
    data: { lastSeenAt: new Date() },
  });
}

export async function revokeSession(id: string, reason: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Every active session for a person inside one org — never their sessions
 *  in other orgs, and never rows already revoked (they keep their first
 *  reason). Returns the count revoked. The optional `client` lets a caller
 *  join an interactive `$transaction`. */
export async function revokeUserSessions(
  userId: string,
  organizationId: string,
  reason: string,
  client: Pick<typeof prisma, "session"> = prisma,
): Promise<number> {
  const result = await client.session.updateMany({
    where: { userId, organizationId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/** Re-stamp the role on every active session a person holds in one org.
 *  The row's role is authoritative at request time (tenant.ts sets
 *  `request.auth.role = session.role`), so updating only the membership
 *  would leave a demoted admin exercising their old powers until re-login.
 *  Call this inside the same transaction as the membership write.
 *  The optional `client` is the transaction client. */
export async function setUserSessionsRole(
  userId: string,
  organizationId: string,
  role: OrganizationRole,
  client: Pick<typeof prisma, "session"> = prisma,
): Promise<number> {
  const result = await client.session.updateMany({
    where: { userId, organizationId, revokedAt: null },
    data: { role },
  });
  return result.count;
}

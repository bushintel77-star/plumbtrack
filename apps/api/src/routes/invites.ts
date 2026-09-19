import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@plumbtrack/database";
import { DEVICE_SESSION_SECONDS, HQ_SESSION_SECONDS, issueAuthToken, ORGANIZATION_ROLES, requireRole } from "../lib/auth";
import { createSession, revokeUserSessions, setUserSessionsRole } from "../lib/sessions";
import { recordAuditEvent } from "../lib/audit";
import { sendEmail } from "../lib/email";
import { hashPassword, passwordProblem } from "../lib/passwords";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { hqAppBase } from "../lib/urls";
import { parseBody, sendValidationError } from "../lib/validation";

/**
 * Team admin (ONBOARDING §6B).
 *
 *   GET   /api/team/members        office roles list the roster (skills
 *                                  included — assignment depends on them)
 *   PATCH /api/team/members/:userId  owner/admin edits a member's skills
 *                                  and/or role. Skills are free-form on
 *                                  purpose: `requiredSkill` on jobs accepts
 *                                  any string, so there is no enum to
 *                                  validate against. This is the only write
 *                                  path for membership skills — without it
 *                                  an invited junior technician is
 *                                  permanently unassignable to any job that
 *                                  declares a requiredSkill. A role change
 *                                  also re-stamps the member's live session
 *                                  rows in the same transaction — the
 *                                  session row's role is authoritative at
 *                                  request time (tenant.ts), so a
 *                                  membership-only update would leave a
 *                                  demoted member exercising their old
 *                                  powers until they next sign in.
 *   DELETE /api/team/members/:userId  owner/admin removes a member: deletes
 *                                  the membership (never the global User
 *                                  row) and revokes their sessions in this
 *                                  org — the lost-people path, not just
 *                                  offboarding.
 *   POST /api/team/members/:userId/sign-out  owner/admin revokes every live
 *                                  session a member holds in this org —
 *                                  the lost/stolen-phone button.
 *   GET  /api/team/invites        owner/admin lists pending invites —
 *                               emails-in-waiting are a management surface,
 *                               never the wider read set.
 *   POST /api/team/invites/:id/revoke  owner/admin kills a pending invite.
 *   POST /api/team/invites        owner/admin creates an invite; delivered
 *                               by email when a provider is configured,
 *                               otherwise the raw link is returned for the
 *                               inviter to share (the share-link channel that
 *                               always works).
 *   GET  /api/invites/:token      public validity peek for the accept page —
 *                               the link is the capability, so it returns
 *                               just what the form needs.
 *   POST /api/invites/:token/accept  sets the invited person's password,
 *                               creates their membership at the invited role,
 *                               signs them in as a real named user.
 *
 * Tokens: random 32 bytes, SHA-256 at rest, single-use, 7-day TTL.
 */

const SESSION_COOKIE = "plumbtrack_hq_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Invite-management routes share the auth limiter — token guessing must
 *  burn out fast, not ride the global per-IP budget. Read at registration
 *  so tests can tune it per app instance. */
const authRateLimit = () => ({
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  timeWindow: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITABLE_ROLES = ORGANIZATION_ROLES;

const TEAM_READ_ROLES = ["dispatcher", "manager", "accountant", "admin", "owner"] as const;
const TEAM_WRITE_ROLES = ["admin", "owner"] as const;

// No min(1): empty/whitespace entries are normalized away rather than
// rejected — the form sends what the operator typed, the server decides.
const memberPatchSchema = z
  .object({
    skills: z.array(z.string().trim().max(40)).max(20).optional(),
    role: z.enum(ORGANIZATION_ROLES).optional(),
  })
  .refine(body => body.skills !== undefined || body.role !== undefined, {
    message: "Send skills, a role, or both.",
    path: ["role"],
  });

/** Trim, drop empties, dedupe case-insensitively keeping the first
 *  occurrence, preserve the given order. */
function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(skill);
  }
  return normalized;
}

function memberShape(membership: {
  userId: string;
  role: string;
  skills: string[];
  createdAt: Date;
  user: { name: string; email: string };
}) {
  return {
    userId: membership.userId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    skills: membership.skills,
    joinedAt: membership.createdAt.toISOString(),
  };
}

const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(INVITABLE_ROLES),
  name: z.string().trim().min(2).max(80).optional(),
});

const acceptSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  password: z.string().min(1).max(256),
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Mounted at /api/team — the office-side invite management surface. */
export async function teamRoutes(app: FastifyInstance): Promise<void> {
  /** The org roster — every office role can read it (dispatch needs skills
   *  to judge assignability); technicians have no business reading the
   *  company's member list. */
  app.get("/members", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_READ_ROLES);
    if (roleFailure) return roleFailure;

    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { members: memberships.map(memberShape) };
  });

  /** Edit one member's skills and/or role. Scoped by the composite
   *  org+user key, so a userId from another org is simply not found — same
   *  404 as a stranger, never a hint that the person exists elsewhere.
   *  A role change must also re-stamp that person's live session rows: the
   *  tenant hook reads `session.role` per request, so a membership-only
   *  write would leave the old powers in force until re-login. */
  app.patch("/members/:userId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_WRITE_ROLES);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(memberPatchSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { userId } = request.params as { userId: string };
    const skills = parsed.data.skills === undefined ? undefined : normalizeSkills(parsed.data.skills);
    const nextRole = parsed.data.role;

    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!membership) {
      return reply.code(404).send({ message: "That person isn't on your team." });
    }

    if (nextRole !== undefined && nextRole !== membership.role) {
      // Self-role edits are refused outright — an admin promoting itself
      // to owner would otherwise be a one-request privilege escalation.
      if (userId === request.auth?.userId) {
        return reply.code(403).send({ message: "You can't change your own role — ask another owner." });
      }
      // The owner boundary mirrors the invite rule: only an owner may
      // grant ownership or take it away.
      if ((nextRole === "owner" || membership.role === "owner") && request.auth?.role !== "owner") {
        return reply.code(403).send({ message: "Only an owner can grant or remove the owner role." });
      }
      if (membership.role === "owner") {
        const owners = await prisma.organizationMembership.count({
          where: { organizationId: orgId, role: "owner" },
        });
        if (owners <= 1) {
          return reply.code(409).send({ message: "Your organisation needs at least one owner." });
        }
      }
    }

    const updated = await prisma.$transaction(async tx => {
      const row = await tx.organizationMembership.update({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        data: {
          ...(skills === undefined ? {} : { skills }),
          ...(nextRole === undefined || nextRole === membership.role ? {} : { role: nextRole }),
        },
        include: { user: { select: { name: true, email: true } } },
      });
      if (nextRole !== undefined && nextRole !== membership.role) {
        // Same transaction: the session rows' role copy is what the tenant
        // hook enforces, so it must move with the membership.
        await setUserSessionsRole(userId, orgId, nextRole, tx);
      }
      return row;
    });

    if (skills !== undefined) {
      recordAuditEvent(request, {
        action: "team.member_skills_updated",
        entityType: "organization_membership",
        entityId: membership.id,
        metadata: { skills },
      });
    }
    if (nextRole !== undefined && nextRole !== membership.role) {
      recordAuditEvent(request, {
        action: "team.member_role_changed",
        entityType: "organization_membership",
        entityId: membership.id,
        metadata: { from: membership.role, to: nextRole },
      });
    }
    return memberShape(updated);
  });

  /** Remove a member. The membership goes; the User row never does — it is
   *  global and may hold memberships in other orgs, so deleting it would
   *  wipe a person's account inside someone else's company. Their sessions
   *  in THIS org are revoked in the same transaction. */
  app.delete("/members/:userId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_WRITE_ROLES);
    if (roleFailure) return roleFailure;

    const { userId } = request.params as { userId: string };
    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!membership) {
      return reply.code(404).send({ message: "That person isn't on your team." });
    }
    if (userId === request.auth?.userId) {
      return reply.code(409).send({ message: "You can't remove your own account — ask another owner." });
    }
    if (membership.role === "owner" && request.auth?.role !== "owner") {
      return reply.code(403).send({ message: "Only an owner can remove an owner." });
    }
    if (membership.role === "owner") {
      const owners = await prisma.organizationMembership.count({
        where: { organizationId: orgId, role: "owner" },
      });
      if (owners <= 1) {
        return reply.code(409).send({ message: "Your organisation needs at least one owner." });
      }
    }

    await prisma.$transaction(async tx => {
      await tx.organizationMembership.delete({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
      await revokeUserSessions(userId, orgId, "member_removed", tx);
    });
    recordAuditEvent(request, {
      action: "team.member_removed",
      entityType: "organization_membership",
      entityId: membership.id,
      metadata: { userId },
    });
    return reply.code(204).send();
  });

  /** Sign a member out of every device — the lost/stolen-phone button.
   *  Membership stays; only their sessions in this org are revoked. */
  app.post("/members/:userId/sign-out", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_WRITE_ROLES);
    if (roleFailure) return roleFailure;

    const { userId } = request.params as { userId: string };
    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!membership) {
      return reply.code(404).send({ message: "That person isn't on your team." });
    }
    if (membership.role === "owner" && request.auth?.role !== "owner") {
      return reply.code(403).send({ message: "Only an owner can sign out an owner." });
    }

    const revoked = await revokeUserSessions(userId, orgId, "signed_out_by_admin");
    recordAuditEvent(request, {
      action: "team.member_signed_out",
      entityType: "organization_membership",
      entityId: membership.id,
      metadata: { userId, revoked },
    });
    return { revoked };
  });

  /** Pending invites only — people who haven't joined yet. Owner/admin:
   *  this lists email addresses before the person exists, so it does not
   *  share the roster's wider read set. Never returns tokenHash — the raw
   *  token is unrecoverable by design and the hash must not leak. */
  app.get("/invites", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_WRITE_ROLES);
    if (roleFailure) return roleFailure;

    const invites = await prisma.teamInvite.findMany({
      where: { orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true, expiresAt: true },
    });
    return {
      invites: invites.map(invite => ({
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
      })),
    };
  });

  /** Kill a pending invite. Org-scoped in the lookup, so an invite id from
   *  another org is simply not found — same 404 as a made-up id. */
  app.post("/invites/:id/revoke", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, TEAM_WRITE_ROLES);
    if (roleFailure) return roleFailure;

    const { id } = request.params as { id: string };
    const invite = await prisma.teamInvite.findFirst({
      where: { id, orgId, acceptedAt: null, revokedAt: null },
    });
    if (!invite) {
      return reply.code(404).send({ message: "That invite isn't outstanding — it may already be used, revoked or expired." });
    }
    // Mirror the create rule: only an owner may kill an owner's invite.
    if (invite.role === "owner" && request.auth?.role !== "owner") {
      return reply.code(403).send({ message: "Only an owner can revoke an owner invite." });
    }

    await prisma.teamInvite.updateMany({
      where: { id: invite.id, orgId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    recordAuditEvent(request, {
      action: "team.invite_revoked",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: { role: invite.role },
    });
    return reply.code(204).send();
  });

  /** Create + deliver an invite. Owner/admin; inviting a new owner requires
   *  the requester to be an owner. */
  app.post("/invites", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["admin", "owner"]);
    if (roleFailure) return roleFailure;

    const parsed = parseBody(createInviteSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { email, role, name } = parsed.data;

    if (role === "owner" && request.auth?.role !== "owner") {
      return reply.code(403).send({ message: "Only an owner can invite another owner." });
    }

    const existingMember = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, user: { email } },
    });
    if (existingMember) {
      return reply.code(409).send({ message: "That person is already on the team." });
    }

    const pending = await prisma.teamInvite.findFirst({
      where: { orgId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) {
      return reply.code(409).send({ message: "An invite is already out for that email." });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const invite = await prisma.teamInvite.create({
      data: {
        orgId,
        email,
        name: name ?? null,
        role,
        tokenHash: sha256(rawToken),
        invitedBy: request.auth?.userId ?? null,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const inviteUrl = `${hqAppBase()}/invite/${rawToken}`;
    let delivered = false;
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
      const result = await sendEmail(
        email,
        `You're invited to ${org?.name ?? "a Crewline team"}`,
        `You've been invited to join ${org?.name ?? "a team"} on Crewline as ${role}.\n\n${inviteUrl}\n\nThe link works once and expires in 7 days.`,
      );
      delivered = result.delivered;
    } catch {
      delivered = false;
    }

    recordAuditEvent(request, {
      action: "team.invite_created",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: { role, delivered },
    });

    return reply.code(201).send({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      /** "email" when a provider delivered it; "link" when the inviter must
       *  share the URL themselves — always works, never faked. */
      delivery: delivered ? "email" : "link",
      ...(delivered ? {} : { inviteUrl }),
    });
  });
}

/** Mounted at /api/invites — the public acceptance half. The token in the
 *  link is the capability; both routes are rate-limited. */
export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  /** Public: is this invite link still good? Powers the accept page. */
  app.get("/:token", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const token = String((request.params as { token: string }).token ?? "");
    if (token.length < 20 || token.length > 128) {
      return reply.code(404).send({ valid: false });
    }
    const invite = await prisma.teamInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { org: { select: { name: true } } },
    });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) {
      return reply.code(404).send({ valid: false });
    }
    return {
      valid: true,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      organizationName: invite.org.name,
    };
  });

  /** Public: accept — set name + password, become a real member, sign in. */
  app.post("/:token/accept", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const token = String((request.params as { token: string }).token ?? "");
    const parsed = parseBody(acceptSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { name, password } = parsed.data;

    const invite = token.length >= 20 && token.length <= 128
      ? await prisma.teamInvite.findUnique({ where: { tokenHash: sha256(token) } })
      : null;
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) {
      return reply.code(410).send({ message: "That invite link is expired, revoked or already used — ask for a new one." });
    }

    const weak = passwordProblem(password);
    if (weak) {
      return reply.code(400).send({ message: weak, issues: [{ path: "password", message: weak }] });
    }

    const displayName = name ?? invite.name;
    if (!displayName) {
      return reply.code(400).send({
        message: "We need your name.",
        issues: [{ path: "name", message: "We need your name." }],
      });
    }

    const passwordHash = await hashPassword(password);
    const accepted = await prisma.$transaction(async tx => {
      const claimed = await tx.teamInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      // A person can hold invites across orgs — the User row is global, the
      // membership is what binds them here.
      let user = await tx.user.findUnique({ where: { email: invite.email } });
      if (user?.passwordHash) {
        // Already a live account — accepting would silently add them to a
        // second org; make them sign in instead.
        throw new Error("account_exists");
      }
      if (!user) {
        user = await tx.user.create({
          data: { email: invite.email, name: displayName, passwordHash },
        });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: { name: user.name || displayName, passwordHash },
        });
      }
      await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: invite.orgId, userId: user.id } },
        create: { organizationId: invite.orgId, userId: user.id, role: invite.role },
        update: { role: invite.role },
      });
      return user;
    }).catch(error => {
      if (error instanceof Error && error.message === "account_exists") return "account_exists" as const;
      throw error;
    });

    if (accepted === "account_exists") {
      return reply.code(409).send({ message: "That email already has an account — sign in instead." });
    }
    if (!accepted) {
      return reply.code(410).send({ message: "That invite link is expired, revoked or already used — ask for a new one." });
    }

    // Same role-aware TTL as /api/auth/login: an invited technician signs in
    // as a field device (30 days); office roles keep the 12h shift session.
    const sessionSeconds = invite.role === "technician" ? DEVICE_SESSION_SECONDS : HQ_SESSION_SECONDS;
    const expiresAt = Math.floor(Date.now() / 1000) + sessionSeconds;
    const sessionRow = await createSession({
      userId: accepted.id,
      organizationId: invite.orgId,
      role: invite.role,
      expiresInSeconds: sessionSeconds,
      userAgent: request.headers["user-agent"] ?? null,
      ip: request.ip,
    });
    const sessionToken = issueAuthToken({
      userId: accepted.id,
      organizationId: invite.orgId,
      role: invite.role,
      expiresInSeconds: sessionSeconds,
      sessionId: sessionRow.id,
    });
    reply.setCookie(SESSION_COOKIE, sessionToken, { ...COOKIE_OPTIONS, maxAge: sessionSeconds });
    request.auth = { userId: accepted.id, organizationId: invite.orgId, role: invite.role, expiresAt, sid: sessionRow.id };
    request.organizationId = invite.orgId;
    recordAuditEvent(request, {
      action: "team.invite_accepted",
      entityType: "team_invite",
      entityId: invite.id,
      metadata: { role: invite.role },
    });

    return reply.code(201).send({
      token: sessionToken,
      userId: accepted.id,
      organizationId: invite.orgId,
      role: invite.role,
      expiresAt,
    });
  });
}

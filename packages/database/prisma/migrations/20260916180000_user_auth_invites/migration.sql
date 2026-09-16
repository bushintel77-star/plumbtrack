-- Real accounts: password + lockout bookkeeping on users, single-use reset
-- tokens, and team invites. All additive — existing rows keep NULL auth
-- fields (legacy/bootstrap sessions don't carry a User row at all).
ALTER TABLE "users"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "team_invites" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" "OrganizationRole" NOT NULL DEFAULT 'technician',
  "tokenHash" TEXT NOT NULL,
  "invitedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "team_invites_tokenHash_key" ON "team_invites"("tokenHash");
CREATE INDEX "team_invites_orgId_email_idx" ON "team_invites"("orgId", "email");
ALTER TABLE "team_invites"
  ADD CONSTRAINT "team_invites_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guided setup + integration connections (OAuth 2.0 PKCE and API-key auth).
-- Additive: no existing table or column is touched.

CREATE TABLE "org_setup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "currentStep" TEXT NOT NULL DEFAULT 'business',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skippedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchedAt" TIMESTAMP(3),
    "launchedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_setup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_setup_orgId_key" ON "org_setup"("orgId");

CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "accountLabel" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "apiKeyEnc" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "connectedBy" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_connections_orgId_provider_key" ON "integration_connections"("orgId", "provider");
CREATE INDEX "integration_connections_orgId_status_idx" ON "integration_connections"("orgId", "status");

CREATE TABLE "integration_interests" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_interests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_interests_orgId_provider_key" ON "integration_interests"("orgId", "provider");

CREATE TABLE "oauth_authorizations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "verifierEnc" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "returnTo" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_authorizations_state_key" ON "oauth_authorizations"("state");
CREATE INDEX "oauth_authorizations_orgId_provider_idx" ON "oauth_authorizations"("orgId", "provider");
CREATE INDEX "oauth_authorizations_expiresAt_idx" ON "oauth_authorizations"("expiresAt");

ALTER TABLE "org_setup" ADD CONSTRAINT "org_setup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_interests" ADD CONSTRAINT "integration_interests_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

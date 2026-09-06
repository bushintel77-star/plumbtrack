-- Slack workspace integration (design §4.6): one workspace per org, bot token
-- server-side only; per-event channel routing. Additive — no existing table
-- or column is touched.

CREATE TABLE "slack_workspaces" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "accessToken" TEXT NOT NULL,
    "botUserId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_workspaces_teamId_key" ON "slack_workspaces"("teamId");
CREATE INDEX "slack_workspaces_orgId_idx" ON "slack_workspaces"("orgId");

CREATE TABLE "slack_channel_routes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_channel_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_channel_routes_workspaceId_eventType_key" ON "slack_channel_routes"("workspaceId","eventType");
CREATE INDEX "slack_channel_routes_workspaceId_idx" ON "slack_channel_routes"("workspaceId");

ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "slack_channel_routes" ADD CONSTRAINT "slack_channel_routes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "slack_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

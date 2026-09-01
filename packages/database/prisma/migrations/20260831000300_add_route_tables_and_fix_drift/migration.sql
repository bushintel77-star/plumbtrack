-- Reconciliation migration closing pre-existing drift between schema.prisma
-- and the applied migration history:
--  * route_versions / route_recalculation_audits existed in the schema but
--    were never migrated (the /api/routes surface queries them),
--  * checklist_items was missing the org foreign key its @relation declares,
--  * two redundant indexes from earlier hand-written migrations are dropped
--    to match what Prisma's schema engine expects.

-- DropIndex
DROP INDEX "checklist_templates_orgId_idx";

-- DropIndex
DROP INDEX "service_agreements_id_key";

-- CreateTable
CREATE TABLE "route_versions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'server',
    "geometry" JSONB NOT NULL,
    "stops" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_recalculation_audits" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "previousVersion" INTEGER,
    "nextVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_recalculation_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_versions_orgId_routeKey_createdAt_idx" ON "route_versions"("orgId", "routeKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "route_versions_orgId_routeKey_version_key" ON "route_versions"("orgId", "routeKey", "version");

-- CreateIndex
CREATE INDEX "route_recalculation_audits_orgId_routeKey_createdAt_idx" ON "route_recalculation_audits"("orgId", "routeKey", "createdAt");

-- AddForeignKey
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_recalculation_audits" ADD CONSTRAINT "route_recalculation_audits_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

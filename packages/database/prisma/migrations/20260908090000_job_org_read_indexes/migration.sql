-- Hot per-org read paths (board poll orderBy createdAt, offline sync cursor
-- updatedAt) previously had no supporting index and degrade to scans as the
-- jobs table grows.
CREATE INDEX "jobs_orgId_createdAt_idx" ON "jobs"("orgId", "createdAt");
CREATE INDEX "jobs_orgId_updatedAt_idx" ON "jobs"("orgId", "updatedAt");

-- Media metadata lives in Postgres while binary content belongs in object storage.
CREATE TYPE "MediaAssetStatus" AS ENUM ('pending', 'uploaded', 'failed');

CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "opId" TEXT,
    "label" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_assets_objectKey_key" ON "media_assets"("objectKey");
CREATE UNIQUE INDEX "media_assets_opId_key" ON "media_assets"("opId");
CREATE INDEX "media_assets_orgId_status_createdAt_idx" ON "media_assets"("orgId", "status", "createdAt");
CREATE INDEX "media_assets_jobId_createdAt_idx" ON "media_assets"("jobId", "createdAt");

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_photos" ADD COLUMN "assetId" TEXT;
CREATE UNIQUE INDEX "job_photos_assetId_key" ON "job_photos"("assetId");
ALTER TABLE "job_photos"
  ADD CONSTRAINT "job_photos_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

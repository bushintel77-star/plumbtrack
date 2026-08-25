-- Document management: job-linked + organisation-wide documents, and
-- requests-for-information (RFIs) against jobs.

CREATE TABLE "job_documents" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "expiresOn" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "currentVersion" JSONB NOT NULL,
    "versions" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_documents_orgId_category_idx" ON "job_documents"("orgId", "category");
CREATE INDEX "job_documents_orgId_expiresOn_idx" ON "job_documents"("orgId", "expiresOn");
CREATE INDEX "job_documents_jobId_idx" ON "job_documents"("jobId");

CREATE TABLE "rfis" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "attachmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'raised',
    "raisedBy" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rfis_jobId_status_idx" ON "rfis"("jobId", "status");
CREATE INDEX "rfis_orgId_status_idx" ON "rfis"("orgId", "status");

ALTER TABLE "job_documents"
  ADD CONSTRAINT "job_documents_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_documents"
  ADD CONSTRAINT "job_documents_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rfis"
  ADD CONSTRAINT "rfis_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rfis"
  ADD CONSTRAINT "rfis_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

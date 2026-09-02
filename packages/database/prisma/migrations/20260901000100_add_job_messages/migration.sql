-- Job-scoped two-way messaging: a short threaded note against one job, sent
-- by dispatch (office → field) or the technician (field → office). Distinct
-- from Rfi (formal raised question) and the free-text job note.

-- CreateTable
CREATE TABLE "job_messages" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'dispatch',
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_messages_jobId_createdAt_idx" ON "job_messages"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "job_messages_orgId_createdAt_idx" ON "job_messages"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

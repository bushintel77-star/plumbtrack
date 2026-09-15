-- Job-message Slack bridge + field outbox idempotency. Additive only — no
-- existing column changes meaning.
--
-- job_messages: provenance (fieldloop | slack), the field outbox opId, and
-- the Slack ts of a bridged reply (unique per job, so Slack's event retries
-- can't double-insert).
ALTER TABLE "job_messages" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'fieldloop';
ALTER TABLE "job_messages" ADD COLUMN "opId" TEXT;
ALTER TABLE "job_messages" ADD COLUMN "slackTs" TEXT;

CREATE UNIQUE INDEX "job_messages_opId_key" ON "job_messages"("opId");
CREATE UNIQUE INDEX "job_messages_jobId_slackTs_key" ON "job_messages"("jobId", "slackTs");

-- job_documents: field capture outbox opId.
ALTER TABLE "job_documents" ADD COLUMN "opId" TEXT;

CREATE UNIQUE INDEX "job_documents_opId_key" ON "job_documents"("opId");

-- One Slack thread per job.
CREATE TABLE "slack_job_threads" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadTs" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_job_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_job_threads_jobId_key" ON "slack_job_threads"("jobId");
CREATE UNIQUE INDEX "slack_job_threads_channelId_threadTs_key" ON "slack_job_threads"("channelId", "threadTs");
CREATE INDEX "slack_job_threads_orgId_idx" ON "slack_job_threads"("orgId");
CREATE INDEX "slack_job_threads_workspaceId_idx" ON "slack_job_threads"("workspaceId");

ALTER TABLE "slack_job_threads" ADD CONSTRAINT "slack_job_threads_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "slack_job_threads" ADD CONSTRAINT "slack_job_threads_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "slack_job_threads" ADD CONSTRAINT "slack_job_threads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "slack_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

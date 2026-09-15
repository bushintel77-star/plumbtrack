-- Customer SMS send records (ETA texts today). Additive only.
--
-- Purposes: the unique opId dedupes client-outbox retries (a retried send
-- returns the recorded outcome instead of double-texting the customer); the
-- row is the audit trail of what was texted to whom; per-org counts feed the
-- SMS spend cap.
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "opId" TEXT,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_messages_opId_key" ON "sms_messages"("opId");
CREATE INDEX "sms_messages_orgId_createdAt_idx" ON "sms_messages"("orgId", "createdAt");
CREATE INDEX "sms_messages_jobId_idx" ON "sms_messages"("jobId");

ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add residential field-service contact metadata to jobs.
ALTER TABLE "jobs" ADD COLUMN "phone" TEXT;
ALTER TABLE "jobs" ADD COLUMN "accessCode" TEXT;

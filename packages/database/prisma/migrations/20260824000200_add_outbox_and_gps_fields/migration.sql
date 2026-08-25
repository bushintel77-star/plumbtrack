-- Make client outbox replays idempotent and retain GPS evidence server-side.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "job_photos" ADD COLUMN IF NOT EXISTS "opId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "job_photos_opId_key" ON "job_photos"("opId");

-- Notifications were introduced after the initial migration in some installs.
-- Create the table defensively so a fresh production database receives it too.
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "opId" TEXT,
    "slackDelivered" BOOLEAN NOT NULL DEFAULT false,
    "slackError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "opId" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "slackDelivered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "slackError" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "notifications_orgId_createdAt_idx" ON "notifications"("orgId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_opId_key" ON "notifications"("opId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_orgId_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

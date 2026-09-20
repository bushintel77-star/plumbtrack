-- P1-4: the server-side urgency signal. Office-marked only (PATCH
-- /api/jobs/:id with {urgent} is a manager+ write); a false→true transition
-- emits the job.status_urgent domain event for the Slack automation route.
ALTER TABLE "jobs" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;

-- Field-captured site arrival/departure timestamps. The field agent posts
-- POST /api/jobs/:id/events {event: arrived|departed, occurredAt}; until these
-- columns existed the endpoint 404'd and the data lived only on the device.
ALTER TABLE "jobs" ADD COLUMN "arrivedAt" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN "departedAt" TIMESTAMP(3);

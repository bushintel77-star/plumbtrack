-- Job coordinates for map visualisation (geocoded from the address at
-- creation/update via the routing proxy; nullable until geocode succeeds).
ALTER TABLE "jobs" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "jobs" ADD COLUMN "lng" DOUBLE PRECISION;

-- Reverse-geocoded street address captured at clock-in (evidence that reads
-- as a place, paired with the recorded GPS fix).
ALTER TABLE "time_entries" ADD COLUMN "address" TEXT;

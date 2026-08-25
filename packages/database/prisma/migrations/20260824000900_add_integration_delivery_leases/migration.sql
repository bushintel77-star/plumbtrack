-- Lease ownership prevents multiple workers from delivering the same provider payload.
ALTER TABLE "integration_deliveries"
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE INDEX "integration_deliveries_status_lockedUntil_idx"
  ON "integration_deliveries"("status", "lockedUntil");

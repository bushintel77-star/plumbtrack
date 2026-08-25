-- Durable downstream delivery queue. Workers can resume after API restarts.
CREATE TYPE "IntegrationDeliveryStatus" AS ENUM ('pending', 'processing', 'delivered', 'failed', 'dead_letter');

CREATE TABLE "integration_deliveries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "notificationId" TEXT,
    "provider" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" "IntegrationDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_deliveries_status_nextAttemptAt_idx"
  ON "integration_deliveries"("status", "nextAttemptAt");
CREATE INDEX "integration_deliveries_orgId_createdAt_idx"
  ON "integration_deliveries"("orgId", "createdAt");

ALTER TABLE "integration_deliveries"
  ADD CONSTRAINT "integration_deliveries_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_deliveries"
  ADD CONSTRAINT "integration_deliveries_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "integration_delivery_attempts" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "providerMessageId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "integration_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_delivery_attempts_deliveryId_attemptNumber_key"
  ON "integration_delivery_attempts"("deliveryId", "attemptNumber");
CREATE INDEX "integration_delivery_attempts_deliveryId_startedAt_idx"
  ON "integration_delivery_attempts"("deliveryId", "startedAt");

ALTER TABLE "integration_delivery_attempts"
  ADD CONSTRAINT "integration_delivery_attempts_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "integration_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_deliveries"
  ADD COLUMN "providerMessageId" TEXT;

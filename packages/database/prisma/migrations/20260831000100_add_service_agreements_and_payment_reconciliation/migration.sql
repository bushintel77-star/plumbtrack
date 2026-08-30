-- Additive migration for service agreements and Stripe payment reconciliation.

CREATE TABLE "service_agreements" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "lastServiceDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_agreements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "jobs" ADD COLUMN "stripeSessionId" TEXT;
ALTER TABLE "jobs" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid';

CREATE UNIQUE INDEX "service_agreements_id_key" ON "service_agreements"("id");
CREATE UNIQUE INDEX "jobs_stripeSessionId_key" ON "jobs"("stripeSessionId");
CREATE INDEX "service_agreements_orgId_nextDueDate_idx" ON "service_agreements"("orgId", "nextDueDate");
CREATE INDEX "service_agreements_customerId_active_idx" ON "service_agreements"("customerId", "active");

ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

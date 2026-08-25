-- Transactional domain-event outbox. Domain mutations and these rows are
-- written in the same transaction so committed state cannot lose its event.
CREATE TYPE "DomainEventOutboxStatus" AS ENUM ('pending', 'processing', 'completed', 'dead-letter');

CREATE TABLE "domain_event_outbox" (
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DomainEventOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "domain_event_outbox_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "domain_event_outbox_status_lockedUntil_idx"
  ON "domain_event_outbox"("status", "lockedUntil");
CREATE INDEX "domain_event_outbox_organizationId_createdAt_idx"
  ON "domain_event_outbox"("organizationId", "createdAt");

ALTER TABLE "domain_event_outbox"
  ADD CONSTRAINT "domain_event_outbox_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

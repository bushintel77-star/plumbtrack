-- P1-5: sync tombstones. Written in the same transaction as the hard
-- delete; /api/sync emits entity ids after the pull cursor so the field
-- device's Watermelon sync destroys its cached row.
CREATE TABLE "deletions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deletions_orgId_entityType_deletedAt_idx" ON "deletions"("orgId", "entityType", "deletedAt");

ALTER TABLE "deletions" ADD CONSTRAINT "deletions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

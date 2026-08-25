-- Add time_entries.staffId and time_entries.opId (idempotency key) to close
-- the drift between schema.prisma and the applied migration history.

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "opId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_opId_key" ON "time_entries"("opId");

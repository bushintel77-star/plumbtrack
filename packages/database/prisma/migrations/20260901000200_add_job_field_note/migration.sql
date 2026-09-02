-- Add the technician's free-text site note (single last-write-wins note) to
-- jobs — distinct from the threaded job_messages conversation.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "fieldNote" TEXT;

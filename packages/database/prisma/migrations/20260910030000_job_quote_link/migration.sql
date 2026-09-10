-- Jobs carry the quote they were created from so the field agent renders the
-- agreed scope/lines automatically (zero re-entry for technicians).
ALTER TABLE "jobs" ADD COLUMN "quoteId" TEXT;
CREATE INDEX "jobs_quoteId_idx" ON "jobs"("quoteId");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

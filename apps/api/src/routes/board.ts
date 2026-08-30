import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { getOrgId, sendMissingOrg } from "../lib/tenant";

/**
 * Board view payload (gap G-1). Returns the jobs + quotes the HQ dispatch
 * board needs in a single round-trip, mapped to the shape `ApiBoardPayload`
 * in apps/hq/src/lib/adapter.ts expects.
 *
 * Field mapping notes:
 *  - Prisma `TimeEntry.start`/`end` are DateTime; Fastify serializes them as
 *    ISO strings, which is what the adapter consumes.
 *  - Prisma `QuoteLine` uses `desc`/`qty`/`rate`; the adapter expects
 *    `description`/`quantity`/`unitPrice`, so we rename here at the source.
 */

export async function boardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);

    const [jobs, quotes] = await Promise.all([
      prisma.job.findMany({
        where: { orgId },
        include: { timeEntries: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.quote.findMany({
        where: { orgId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      jobs: jobs.map((job) => ({
        id: job.id,
        client: job.client,
        address: job.address,
        scope: job.scope,
        status: job.status,
        createdAt: job.createdAt,
        timeEntries: job.timeEntries.map((entry) => ({
          id: entry.id,
          staffId: entry.staffId,
          start: entry.start,
          end: entry.end,
        })),
      })),
      quotes: quotes.map((quote) => ({
        id: quote.id,
        client: quote.client,
        status: quote.status,
        lines: quote.lines.map((line) => ({
          id: line.id,
          description: line.desc,
          quantity: line.qty,
          unitPrice: line.rate,
        })),
      })),
    };
  });
}

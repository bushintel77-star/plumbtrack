import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { quoteFindFirst, lineUpdateMany, lineFindFirst } = vi.hoisted(() => ({
  quoteFindFirst: vi.fn(),
  lineUpdateMany: vi.fn(),
  lineFindFirst: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    quote: {
      findFirst: quoteFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    quoteLine: {
      create: vi.fn(),
      updateMany: lineUpdateMany,
      findFirst: lineFindFirst,
      deleteMany: vi.fn(),
    },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";
const QUOTE = { id: "Q-1", orgId: ORG, status: "draft" };

describe("quote line scoping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    quoteFindFirst.mockResolvedValue(QUOTE);
  });

  it("updates a line scoped to the org-verified quote", async () => {
    lineUpdateMany.mockResolvedValueOnce({ count: 1 });
    lineFindFirst.mockResolvedValueOnce({ id: "L-1", quoteId: "Q-1", desc: "Parts", qty: 2, rate: 100 });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/quotes/Q-1/lines/L-1",
      headers: { "x-organization-id": ORG },
      payload: { qty: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(lineUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "L-1", quoteId: "Q-1" } }),
    );
  });

  it("404s a line id that belongs to another org's quote", async () => {
    // Quote Q-1 resolves for this org, but the line id matches nothing under
    // that quote — the scoped updateMany finds no row and the route 404s
    // instead of mutating a foreign line.
    lineUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/quotes/Q-1/lines/L-foreign",
      headers: { "x-organization-id": ORG },
      payload: { qty: 3 },
    });

    expect(response.statusCode).toBe(404);
    expect(lineUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "L-foreign", quoteId: "Q-1" } }),
    );
    expect(lineFindFirst).not.toHaveBeenCalled();
  });
});

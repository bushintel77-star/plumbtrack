import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { quoteFindFirst, quoteUpdateMany, quoteFindUnique, lineUpdateMany, lineFindFirst, auditCreate } = vi.hoisted(() => ({
  quoteFindFirst: vi.fn(),
  quoteUpdateMany: vi.fn(),
  quoteFindUnique: vi.fn(),
  lineUpdateMany: vi.fn(),
  lineFindFirst: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    quote: {
      findFirst: quoteFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateMany: quoteUpdateMany,
      deleteMany: vi.fn(),
      findUnique: quoteFindUnique,
    },
    quoteLine: {
      create: vi.fn(),
      updateMany: lineUpdateMany,
      findFirst: lineFindFirst,
      deleteMany: vi.fn(),
    },
    auditEvent: { create: auditCreate },
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
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteFindUnique.mockResolvedValue({ ...QUOTE, lines: [] });
    auditCreate.mockResolvedValue({});
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

describe("quote lifecycle (P1-11) — draft → sent → accepted, accepted is immutable", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteFindUnique.mockResolvedValue({ ...QUOTE, lines: [] });
    auditCreate.mockResolvedValue({});
  });

  const patch = (status: string) =>
    app.inject({
      method: "PATCH",
      url: "/api/quotes/Q-1",
      headers: { "x-organization-id": ORG },
      payload: { status },
    });

  it.each([
    ["draft", "sent"],
    ["sent", "accepted"],
  ])("allows the legal %s → %s transition", async (from, to) => {
    quoteFindFirst.mockResolvedValue({ ...QUOTE, status: from });
    const res = await patch(to);
    expect(res.statusCode).toBe(200);
    expect(quoteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: to } }),
    );
  });

  it.each([
    ["draft", "accepted"],
    ["sent", "draft"],
    ["accepted", "draft"],
    ["accepted", "sent"],
  ])("409s the illegal %s → %s jump", async (from, to) => {
    quoteFindFirst.mockResolvedValue({ ...QUOTE, status: from });
    const res = await patch(to);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/lifecycle|agreed price/i);
    expect(quoteUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["lines/L-1", "POST", "/api/quotes/Q-1/lines"],
    ["lines/L-1", "PATCH", "/api/quotes/Q-1/lines/L-1"],
    ["lines/L-1", "DELETE", "/api/quotes/Q-1/lines/L-1"],
  ])("locks quote %s edits once the quote is accepted (%s)", async (_label, method, url) => {
    quoteFindFirst.mockResolvedValue({ ...QUOTE, status: "accepted" });
    const res = await app.inject({
      method: method as "POST" | "PATCH" | "DELETE",
      url,
      headers: { "x-organization-id": ORG },
      payload: method === "DELETE" ? undefined : { qty: 3 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/agreed price/i);
  });
});

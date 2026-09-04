import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import {
  createQuoteSchema,
  quoteLineInputSchema,
  updateQuoteLineSchema,
  updateQuoteSchema,
} from "../schemas/quote";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";

export async function quoteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.quote.findMany({
      where: { orgId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "accountant", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createQuoteSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { lines, ...rest } = parsed.data;
    const quote = await prisma.quote.create({
      data: {
        ...rest,
        orgId,
        lines: {
          create: lines.map((line, index) => ({ ...line, sortOrder: index })),
        },
      },
      include: { lines: true },
    });
    recordAuditEvent(request, {
      action: "quote.created",
      entityType: "quote",
      entityId: quote.id,
      metadata: { lineCount: lines.length, status: quote.status },
    });
    return reply.code(201).send(quote);
  });

  app.get("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const quote = await prisma.quote.findFirst({
      where: { id, orgId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!quote) return reply.code(404).send({ message: "Quote not found" });
    return quote;
  });

  app.patch("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "accountant", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateQuoteSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const result = await prisma.quote.updateMany({
      where: { id, orgId },
      data: parsed.data,
    });
    if (result.count === 0) return reply.code(404).send({ message: "Quote not found" });
    recordAuditEvent(request, { action: "quote.updated", entityType: "quote", entityId: id, metadata: parsed.data });
    return prisma.quote.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  app.delete("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const result = await prisma.quote.deleteMany({ where: { id, orgId } });
    if (result.count === 0) return reply.code(404).send({ message: "Quote not found" });
    recordAuditEvent(request, { action: "quote.deleted", entityType: "quote", entityId: id });
    return reply.code(204).send();
  });

  // Quote lines
  app.post("/:id/lines", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "accountant", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const quote = await prisma.quote.findFirst({ where: { id, orgId } });
    if (!quote) return reply.code(404).send({ message: "Quote not found" });
    const parsed = parseBody(quoteLineInputSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const last = await prisma.quoteLine.findFirst({
      where: { quoteId: id },
      orderBy: { sortOrder: "desc" },
    });
    const line = await prisma.quoteLine.create({
      data: {
        ...parsed.data,
        quoteId: id,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    recordAuditEvent(request, { action: "quote_line.created", entityType: "quote_line", entityId: line.id, metadata: { quoteId: id } });
    return reply.code(201).send(line);
  });

  app.patch("/:id/lines/:lineId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "accountant", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id, lineId } = request.params as { id: string; lineId: string };
    const quote = await prisma.quote.findFirst({ where: { id, orgId } });
    if (!quote) return reply.code(404).send({ message: "Quote not found" });
    const parsed = parseBody(updateQuoteLineSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    // Scope the line to the org-verified quote — updating by line id alone
    // would allow a guessed line id from another org's quote to be mutated.
    const result = await prisma.quoteLine.updateMany({
      where: { id: lineId, quoteId: id },
      data: parsed.data,
    });
    if (result.count === 0) return reply.code(404).send({ message: "Line item not found" });
    const line = await prisma.quoteLine.findFirst({ where: { id: lineId, quoteId: id } });
    recordAuditEvent(request, { action: "quote_line.updated", entityType: "quote_line", entityId: lineId, metadata: { quoteId: id } });
    return line;
  });

  app.delete("/:id/lines/:lineId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "accountant", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { id, lineId } = request.params as { id: string; lineId: string };
    const result = await prisma.quoteLine.deleteMany({
      where: { id: lineId, quoteId: id },
    });
    if (result.count === 0) return reply.code(404).send({ message: "Line item not found" });
    recordAuditEvent(request, { action: "quote_line.deleted", entityType: "quote_line", entityId: lineId, metadata: { quoteId: id } });
    return reply.code(204).send();
  });
}

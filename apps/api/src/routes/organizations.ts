import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { createOrganizationSchema } from "../schemas/organization";
import { parseBody, sendValidationError } from "../lib/validation";

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.organization.findUnique({ where: { id: orgId } });
  });

  app.get("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    if (id !== orgId) return reply.code(404).send({ message: "Organization not found" });
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return reply.code(404).send({ message: "Organization not found" });
    return org;
  });

  // Provisioning should normally happen through an identity/admin service;
  // this route remains available for the local bootstrap flow only to an
  // already-authenticated owner/admin session.
  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["admin", "owner"]);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createOrganizationSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const org = await prisma.organization.create({ data: parsed.data });
    return reply.code(201).send(org);
  });
}

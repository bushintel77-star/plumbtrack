import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import {
  createAppointmentSchema,
  createCustomerSchema,
  createPropertySchema,
  updateAppointmentSchema,
  updateCustomerSchema,
  updatePropertySchema,
  serviceAgreementSchema,
  updateServiceAgreementSchema,
} from "../schemas/residential";

const operationalRoles = ["technician", "dispatcher", "manager", "admin", "owner"] as const;
const officeRoles = ["dispatcher", "manager", "admin", "owner"] as const;

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.customer.findMany({
      where: { orgId },
      include: { properties: true },
      orderBy: { name: "asc" },
      take: 200,
    });
  });

  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, operationalRoles);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createCustomerSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const customer = await prisma.customer.create({ data: { ...parsed.data, orgId } });
    recordAuditEvent(request, { action: "customer.created", entityType: "customer", entityId: customer.id });
    return reply.code(201).send(customer);
  });

  app.get("/:id/agreements", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({ where: { id, orgId } });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    return prisma.serviceAgreement.findMany({ where: { customerId: id, orgId }, orderBy: { nextDueDate: "asc" } });
  });

  app.post("/:id/agreements", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, officeRoles);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({ where: { id, orgId } });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    const parsed = parseBody(serviceAgreementSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const agreement = await prisma.serviceAgreement.create({ data: { ...parsed.data, orgId, customerId: id, lastServiceDate: parsed.data.lastServiceDate ? new Date(parsed.data.lastServiceDate) : null, nextDueDate: new Date(parsed.data.nextDueDate) } });
    recordAuditEvent(request, { action: "service_agreement.created", entityType: "service_agreement", entityId: agreement.id, metadata: { customerId: id } });
    return reply.code(201).send(agreement);
  });

  app.put("/:customerId/agreements/:agreementId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, officeRoles);
    if (roleFailure) return roleFailure;
    const { customerId, agreementId } = request.params as { customerId: string; agreementId: string };
    const parsed = parseBody(updateServiceAgreementSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const data = { ...(parsed.data.serviceType !== undefined ? { serviceType: parsed.data.serviceType } : {}), ...(parsed.data.frequency !== undefined ? { frequency: parsed.data.frequency } : {}), ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}), ...(parsed.data.lastServiceDate !== undefined ? { lastServiceDate: parsed.data.lastServiceDate ? new Date(parsed.data.lastServiceDate) : null } : {}), ...(parsed.data.nextDueDate !== undefined ? { nextDueDate: new Date(parsed.data.nextDueDate) } : {}) };
    const result = await prisma.serviceAgreement.updateMany({ where: { id: agreementId, customerId, orgId }, data });
    if (result.count === 0) return reply.code(404).send({ message: "Service agreement not found" });
    recordAuditEvent(request, { action: "service_agreement.updated", entityType: "service_agreement", entityId: agreementId, metadata: { customerId, ...parsed.data } });
    return prisma.serviceAgreement.findFirst({ where: { id: agreementId, customerId, orgId } });
  });

  app.get("/:id/properties", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({ where: { id, orgId } });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    return prisma.property.findMany({ where: { customerId: id, orgId }, orderBy: { address: "asc" } });
  });

  app.post("/:id/properties", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, operationalRoles);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({ where: { id, orgId } });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    const parsed = parseBody(createPropertySchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const property = await prisma.property.create({ data: { ...parsed.data, orgId, customerId: id } });
    recordAuditEvent(request, { action: "property.created", entityType: "property", entityId: property.id, metadata: { customerId: id } });
    return reply.code(201).send(property);
  });

  app.get("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({ where: { id, orgId }, include: { properties: true, jobs: { orderBy: { createdAt: "desc" }, include: { appointments: { orderBy: { scheduledStart: "desc" }, take: 1 } } }, serviceAgreements: { where: { active: true }, orderBy: { nextDueDate: "asc" } } } });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    return customer;
  });

  app.patch("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, officeRoles);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateCustomerSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const result = await prisma.customer.updateMany({ where: { id, orgId }, data: parsed.data });
    if (result.count === 0) return reply.code(404).send({ message: "Customer not found" });
    recordAuditEvent(request, { action: "customer.updated", entityType: "customer", entityId: id, metadata: parsed.data });
    return prisma.customer.findFirst({ where: { id, orgId }, include: { properties: true } });
  });

  app.patch("/:customerId/properties/:propertyId", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, officeRoles);
    if (roleFailure) return roleFailure;
    const { customerId, propertyId } = request.params as { customerId: string; propertyId: string };
    const parsed = parseBody(updatePropertySchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const result = await prisma.property.updateMany({ where: { id: propertyId, customerId, orgId }, data: parsed.data });
    if (result.count === 0) return reply.code(404).send({ message: "Property not found" });
    recordAuditEvent(request, { action: "property.updated", entityType: "property", entityId: propertyId, metadata: { customerId, ...parsed.data } });
    return prisma.property.findFirst({ where: { id: propertyId, customerId, orgId } });
  });
}

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    return prisma.appointment.findMany({ where: { orgId }, orderBy: { scheduledStart: "asc" }, take: 200 });
  });

  app.post("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, officeRoles);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(createAppointmentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const job = await prisma.job.findFirst({ where: { id: parsed.data.jobId, orgId } });
    if (!job) return reply.code(404).send({ message: "Job not found" });
    const appointment = await prisma.appointment.create({
      data: {
        orgId,
        jobId: job.id,
        assignedStaffId: parsed.data.assignedStaffId,
        scheduledStart: new Date(parsed.data.scheduledStart),
        scheduledEnd: parsed.data.scheduledEnd ? new Date(parsed.data.scheduledEnd) : undefined,
        status: parsed.data.status,
      },
    });
    recordAuditEvent(request, { action: "appointment.created", entityType: "appointment", entityId: appointment.id, metadata: { jobId: job.id } });
    return reply.code(201).send(appointment);
  });

  app.patch("/:id", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, [...officeRoles, "technician"]);
    if (roleFailure) return roleFailure;
    const { id } = request.params as { id: string };
    const parsed = parseBody(updateAppointmentSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const data = {
      ...(parsed.data.assignedStaffId !== undefined ? { assignedStaffId: parsed.data.assignedStaffId } : {}),
      ...(parsed.data.scheduledStart ? { scheduledStart: new Date(parsed.data.scheduledStart) } : {}),
      ...(parsed.data.scheduledEnd !== undefined ? { scheduledEnd: parsed.data.scheduledEnd ? new Date(parsed.data.scheduledEnd) : null } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    };
    const result = await prisma.appointment.updateMany({ where: { id, orgId }, data });
    if (result.count === 0) return reply.code(404).send({ message: "Appointment not found" });
    recordAuditEvent(request, { action: "appointment.updated", entityType: "appointment", entityId: id, metadata: parsed.data });
    return prisma.appointment.findFirst({ where: { id, orgId } });
  });
}

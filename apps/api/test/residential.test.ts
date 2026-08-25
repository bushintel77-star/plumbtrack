import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const {
  findManyCustomer,
  findFirstCustomer,
  createCustomer,
  updateCustomer,
  findManyProperty,
  findFirstProperty,
  createProperty,
  updateProperty,
  findFirstJob,
  findManyAppointment,
  createAppointment,
  updateAppointment,
  findFirstAppointment,
} = vi.hoisted(() => ({
  findManyCustomer: vi.fn(), findFirstCustomer: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn(),
  findManyProperty: vi.fn(), findFirstProperty: vi.fn(), createProperty: vi.fn(), updateProperty: vi.fn(),
  findFirstJob: vi.fn(), findManyAppointment: vi.fn(), createAppointment: vi.fn(), updateAppointment: vi.fn(), findFirstAppointment: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    customer: { findMany: findManyCustomer, findFirst: findFirstCustomer, create: createCustomer, updateMany: updateCustomer },
    property: { findMany: findManyProperty, findFirst: findFirstProperty, create: createProperty, updateMany: updateProperty },
    job: { findFirst: findFirstJob },
    appointment: { findMany: findManyAppointment, create: createAppointment, updateMany: updateAppointment, findFirst: findFirstAppointment },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org-caulfield";

describe("residential customer, property, and appointment routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    findManyCustomer.mockResolvedValue([]);
    findFirstCustomer.mockResolvedValue({ id: "customer-1", orgId: ORG });
    createCustomer.mockResolvedValue({ id: "customer-1", orgId: ORG, name: "Marlene Cho" });
    updateCustomer.mockResolvedValue({ count: 1 });
    findManyProperty.mockResolvedValue([]);
    findFirstProperty.mockResolvedValue({ id: "property-1", orgId: ORG, customerId: "customer-1" });
    createProperty.mockResolvedValue({ id: "property-1", orgId: ORG, customerId: "customer-1", address: "9 Booran Rd" });
    updateProperty.mockResolvedValue({ count: 1 });
    findManyAppointment.mockResolvedValue([]);
    findFirstAppointment.mockResolvedValue({ id: "appointment-1", orgId: ORG });
    createAppointment.mockResolvedValue({ id: "appointment-1", orgId: ORG, jobId: "J-1", status: "assigned" });
    updateAppointment.mockResolvedValue({ count: 1 });
  });

  it("lists only customers from the resolved organization", async () => {
    const response = await app.inject({ method: "GET", url: "/api/customers", headers: { "x-organization-id": ORG } });
    expect(response.statusCode).toBe(200);
    expect(findManyCustomer).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: ORG } }));
  });

  it("prevents creating a property for a customer outside the organization", async () => {
    findFirstCustomer.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/customers/customer-1/properties",
      headers: { "x-organization-id": ORG },
      payload: { address: "9 Booran Rd" },
    });
    expect(response.statusCode).toBe(404);
    expect(createProperty).not.toHaveBeenCalled();
  });

  it("requires an organization-owned job before creating an appointment", async () => {
    findFirstJob.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: { "x-organization-id": ORG },
      payload: { jobId: "J-other", scheduledStart: "2026-08-24T09:00:00.000Z" },
    });
    expect(response.statusCode).toBe(404);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("creates an appointment linked to an organization-owned job", async () => {
    findFirstJob.mockResolvedValue({ id: "J-1", orgId: ORG });
    const response = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: { "x-organization-id": ORG },
      payload: { jobId: "J-1", assignedStaffId: "tim", scheduledStart: "2026-08-24T09:00:00.000Z" },
    });
    expect(response.statusCode).toBe(201);
    expect(createAppointment).toHaveBeenCalledWith({ data: expect.objectContaining({ orgId: ORG, jobId: "J-1", assignedStaffId: "tim" }) });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * P1-2 — least-privilege customer reads. Before this pass ANY authenticated
 * session (a technician token included) could pull the full customer
 * directory with property access codes and every account's history. Now:
 *   GET /            technician → id/name/phone of customers on their own
 *                    assigned jobs only; office/accountant keep the directory
 *   GET /:id         technician → 403 unless an assigned job links them;
 *                    granted, the service history is scoped to their jobs
 *   GET /:id/properties, /:id/agreements
 *                    technician → same assigned-job grant
 * Office/accountant behaviour is unchanged throughout.
 */

const { customerFindMany, customerFindFirst, appointmentFindFirst, agreementFindMany, propertyFindMany } =
  vi.hoisted(() => ({
    customerFindMany: vi.fn(),
    customerFindFirst: vi.fn(),
    appointmentFindFirst: vi.fn(),
    agreementFindMany: vi.fn(),
    propertyFindMany: vi.fn(),
  }));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    customer: { findMany: customerFindMany, findFirst: customerFindFirst },
    appointment: { findFirst: appointmentFindFirst },
    serviceAgreement: { findMany: agreementFindMany },
    property: { findMany: propertyFindMany },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";

const ORG = "org-customer-access";
const bearer = (role: string, userId = "user-tech") =>
  `Bearer ${issueAuthToken({ userId, organizationId: ORG, role: role as never })}`;

const CUSTOMER = { id: "cus-1", orgId: ORG, name: "Marlene Cho", phone: "0400 111 222" };

describe("least-privilege customer reads", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    customerFindMany.mockResolvedValue([CUSTOMER]);
    customerFindFirst.mockResolvedValue(CUSTOMER);
    appointmentFindFirst.mockResolvedValue({ id: "appt-1" });
    agreementFindMany.mockResolvedValue([]);
    propertyFindMany.mockResolvedValue([]);
  });

  describe("GET /api/customers (directory)", () => {
    it("gives a technician a field-safe projection scoped to their assigned jobs", async () => {
      const res = await app.inject({ method: "GET", url: "/api/customers", headers: { authorization: bearer("technician") } });
      expect(res.statusCode).toBe(200);
      // Scoped to customers on the technician's assigned jobs…
      const args = customerFindMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, boolean> };
      expect(args.where).toMatchObject({ orgId: ORG, jobs: { some: { appointments: { some: { assignedStaffId: "user-tech" } } } } });
      // …and projected to id/name/phone only — no properties, email or notes.
      expect(args.select).toEqual({ id: true, name: true, phone: true });
      expect(res.json()).toEqual([CUSTOMER]);
    });

    it("keeps the full directory for office roles", async () => {
      const res = await app.inject({ method: "GET", url: "/api/customers", headers: { authorization: bearer("dispatcher") } });
      expect(res.statusCode).toBe(200);
      const args = customerFindMany.mock.calls[0][0] as { where: Record<string, unknown>; select?: Record<string, boolean>; include?: unknown };
      expect(args.where).toEqual({ orgId: ORG });
      expect(args.select).toBeUndefined();
      expect(args.include).toMatchObject({ properties: true });
    });
  });

  describe("GET /api/customers/:id (detail)", () => {
    it("serves a technician whose assigned job links them, with their own job history only", async () => {
      const res = await app.inject({ method: "GET", url: "/api/customers/cus-1", headers: { authorization: bearer("technician") } });
      expect(res.statusCode).toBe(200);
      const appointmentArgs = appointmentFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(appointmentArgs.where).toMatchObject({ orgId: ORG, assignedStaffId: "user-tech", job: { is: { customerId: "cus-1", orgId: ORG } } });
      const detailArgs = customerFindFirst.mock.calls[0][0] as { include: { jobs: { where: Record<string, unknown> } } };
      expect(detailArgs.include.jobs.where).toMatchObject({ appointments: { some: { assignedStaffId: "user-tech" } } });
    });

    it("403s a technician with no assigned job for the customer", async () => {
      appointmentFindFirst.mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: "/api/customers/cus-1", headers: { authorization: bearer("technician") } });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/not on one of your assigned jobs/i);
      expect(customerFindFirst).not.toHaveBeenCalled();
    });

    it("keeps the full record for office roles", async () => {
      const res = await app.inject({ method: "GET", url: "/api/customers/cus-1", headers: { authorization: bearer("manager") } });
      expect(res.statusCode).toBe(200);
      expect(appointmentFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/customers/:id/properties and /agreements", () => {
    it.each(["properties", "agreements"])("403s a technician without the assigned-job grant on %s", async (sub) => {
      appointmentFindFirst.mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: `/api/customers/cus-1/${sub}`, headers: { authorization: bearer("technician") } });
      expect(res.statusCode).toBe(403);
    });

    it.each(["properties", "agreements"])("serves a granted technician on %s", async (sub) => {
      const res = await app.inject({ method: "GET", url: `/api/customers/cus-1/${sub}`, headers: { authorization: bearer("technician") } });
      expect(res.statusCode).toBe(200);
    });

    it.each(["properties", "agreements"])("keeps office access on %s without the grant check", async (sub) => {
      const res = await app.inject({ method: "GET", url: `/api/customers/cus-1/${sub}`, headers: { authorization: bearer("accountant") } });
      expect(res.statusCode).toBe(200);
      expect(appointmentFindFirst).not.toHaveBeenCalled();
    });
  });
});

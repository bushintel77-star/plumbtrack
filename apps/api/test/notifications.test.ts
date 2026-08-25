import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock the database and the Slack relay so the route test runs without a DB
// or network. Both are intercepted by their absolute module id, so the route's
// own imports resolve to these mocks too. vi.hoisted keeps the mock fns alive
// before the mocked modules are first imported.
const {
  createNotification,
  createAuditEvent,
  updateNotification,
  findFirstNotification,
  findManyNotifications,
  isSlackConfiguredMock,
  relayToSlackMock,
  transaction,
  createDomainEvent,
} = vi.hoisted(() => ({
  createNotification: vi.fn(),
  createAuditEvent: vi.fn(),
  updateNotification: vi.fn(),
  findFirstNotification: vi.fn(),
  findManyNotifications: vi.fn(),
  isSlackConfiguredMock: vi.fn(() => true),
  relayToSlackMock: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    notification: {
      create: createNotification,
      update: updateNotification,
      findFirst: findFirstNotification,
      findMany: findManyNotifications,
    },
    auditEvent: { create: createAuditEvent },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
  },
}));

vi.mock("../src/lib/slack", () => ({
  isSlackConfigured: isSlackConfiguredMock,
  relayToSlack: relayToSlackMock,
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";

const storedNotification = {
  id: "n1",
  orgId: ORG,
  channel: "field-updates",
  author: "plumbtrack",
  text: "📍 Clocked on at J-1042",
  slackDelivered: false,
  slackError: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("notification dispatcher routes", () => {
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
    createNotification.mockResolvedValue(storedNotification);
    createAuditEvent.mockResolvedValue({ id: "audit-1" });
    findFirstNotification.mockResolvedValue(null);
    findManyNotifications.mockResolvedValue([]);
    isSlackConfiguredMock.mockReturnValue(true);
    relayToSlackMock.mockResolvedValue({ delivered: true });
    createDomainEvent.mockResolvedValue({});
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      notification: { create: createNotification },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("rejects a POST without a tenant header before touching the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      payload: { channel: "general", author: "tim", text: "hello" },
    });
    expect(response.statusCode).toBe(400);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload without touching the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { channel: "", author: "", text: "   " },
    });
    expect(response.statusCode).toBe(400);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("persists internally with a transactional provider-neutral event", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { channel: "field-updates", author: "plumbtrack", text: "📍 Clocked on at J-1042" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "n1", channel: "field-updates" });
    expect(createNotification).toHaveBeenCalledWith({
      data: {
        channel: "field-updates",
        author: "plumbtrack",
        text: "📍 Clocked on at J-1042",
        orgId: ORG,
      },
    });

    expect(createDomainEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "notification.created:org_caulfield_south:n1",
        organizationId: ORG,
        type: "notification.created",
      }),
    });
    await vi.waitFor(() => {
      expect(createAuditEvent).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: ORG,
          action: "notification.created",
          entityType: "notification",
          entityId: "n1",
        }),
      });
    });
  });

  it("does not duplicate a notification when an outbox replay is retried", async () => {
    findFirstNotification.mockResolvedValue(storedNotification);

    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { opId: "outbox-1", channel: "field-updates", author: "plumbtrack", text: "hello" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "n1" });
    expect(createNotification).not.toHaveBeenCalled();
    expect(findFirstNotification).toHaveBeenCalledWith({ where: { orgId: ORG, opId: "outbox-1" } });
  });

  it("still returns the notification when downstream processing is unavailable", async () => {
    relayToSlackMock.mockResolvedValue({ delivered: false, error: "network down" });

    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { channel: "general", author: "tim", text: "hello" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "n1" });
  });

  it("still returns the persisted notification when the provider is unconfigured", async () => {
    relayToSlackMock.mockResolvedValue({ delivered: false, error: "no webhook configured" });

    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { channel: "general", author: "tim", text: "hello" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "n1" });
  });

  it("lists recent notifications for an org", async () => {
    findManyNotifications.mockResolvedValue([storedNotification]);
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(findManyNotifications).toHaveBeenCalledWith({
      where: { orgId: ORG },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("exposes Slack relay configuration via the status endpoint", async () => {
    isSlackConfiguredMock.mockReturnValue(true);
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/status",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slackConnected: false });
  });

  it("rejects the status endpoint without a tenant header", async () => {
    const response = await app.inject({ method: "GET", url: "/api/notifications/status" });
    expect(response.statusCode).toBe(400);
  });
});

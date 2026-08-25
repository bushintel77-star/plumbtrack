import type { FastifyInstance } from "fastify";
import { isSlackConfigured } from "../lib/slack";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async () => ({
    status: "ok",
    service: "plumbtrack-api",
    timestamp: new Date().toISOString(),
    slack: {
      webhookConfigured: isSlackConfigured(),
    },
  }));
}

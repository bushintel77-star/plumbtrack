import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { assertAuthConfiguration } from "./lib/auth";
import { tenantPlugin } from "./lib/tenant";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { organizationRoutes } from "./routes/organizations";
import { jobRoutes } from "./routes/jobs";
import { quoteRoutes } from "./routes/quotes";
import { notificationRoutes } from "./routes/notifications";
import { documentRoutes } from "./routes/documents";
import { mediaRoutes } from "./routes/media";
import { appointmentRoutes, customerRoutes } from "./routes/residential";
import { integrationRoutes } from "./routes/integrations";
import { slackEventRoutes } from "./routes/slackEvents";
import { streamRoutes } from "./routes/stream";
import { syncRoutes } from "./routes/sync";
import { routeRoutes } from "./routes/routes";
import { paymentWebhookRoutes } from "./routes/paymentWebhook";
import { boardRoutes } from "./routes/board";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  assertAuthConfiguration();
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(helmet);
  await app.register(cookie);
  // CORS_ORIGINS (comma-separated) restricts browser callers to a configured
  // allowlist. When unset the origin is reflected — acceptable here because
  // sessions are explicit bearer tokens, never ambient cookies, so a rogue
  // origin cannot cause the browser to attach credentials automatically.
  const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  await app.register(cors, corsOrigins?.length ? { origin: corsOrigins } : { origin: true });
  // Per-IP request cap, env-tunable for production traffic profiles.
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 500);
  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(rateLimitMax) || rateLimitMax <= 0 || !Number.isFinite(rateLimitWindowMs) || rateLimitWindowMs <= 0) {
    throw new Error("Invalid rate-limit configuration: RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS must be positive numbers");
  }
  await app.register(rateLimit, { max: rateLimitMax, timeWindow: rateLimitWindowMs });
  await app.register(tenantPlugin);

  app.get("/", async () => ({ service: "plumbtrack-api", status: "ok" }));

  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(boardRoutes, { prefix: "/api/board" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(organizationRoutes, { prefix: "/api/organizations" });
  await app.register(jobRoutes, { prefix: "/api/jobs" });
  await app.register(quoteRoutes, { prefix: "/api/quotes" });
  await app.register(notificationRoutes, { prefix: "/api/notifications" });
  await app.register(documentRoutes, { prefix: "/api" });
  await app.register(mediaRoutes, { prefix: "/api/media" });
  await app.register(customerRoutes, { prefix: "/api/customers" });
  await app.register(appointmentRoutes, { prefix: "/api/appointments" });
  await app.register(integrationRoutes, { prefix: "/api/integrations" });
  await app.register(slackEventRoutes, { prefix: "/api/slack" });
  await app.register(streamRoutes);
  await app.register(syncRoutes);
  await app.register(routeRoutes, { prefix: "/api/routes" });
  await app.register(paymentWebhookRoutes, { prefix: "/api/webhooks" });

  return app;
}

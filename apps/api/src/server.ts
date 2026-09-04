import { randomUUID } from "node:crypto";
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
import { fleetRoutes } from "./routes/fleet";
import { routingRoutes } from "./routes/routing";
import { smsRoutes } from "./routes/sms";
import { jobMessageRoutes } from "./routes/jobMessages";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  assertAuthConfiguration();
  const app = Fastify({
    // Default logger (used outside tests): JSON lines with auth-sensitive
    // headers redacted. The request id honours the client's x-request-id so a
    // support ticket can be correlated to server logs; only safe characters
    // are accepted to prevent log injection.
    logger:
      options.logger ?? {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
          censor: "[redacted]",
        },
      },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && /^[A-Za-z0-9-_]{1,128}$/.test(incoming) ? incoming : randomUUID();
    },
  });

  await app.register(helmet);
  await app.register(cookie);
  // CORS_ORIGINS (comma-separated) restricts browser callers to a configured
  // allowlist. credentials: true is needed because the HQ client sends
  // credentials: "include" on its fetch calls — which is exactly why an
  // unset allowlist must not reflect arbitrary origins in production: any
  // website could then make cookie-authenticated, response-readable calls.
  // Fail closed at boot, same contract as AUTH_SECRET.
  const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!corsOrigins?.length && process.env.NODE_ENV === "production") {
    throw new Error("CORS_ORIGINS must be configured in production: the API issues cookie sessions, so reflecting arbitrary origins with credentials is not permitted");
  }
  await app.register(cors, {
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  });
  // Per-IP request cap, env-tunable for production traffic profiles.
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 500);
  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(rateLimitMax) || rateLimitMax <= 0 || !Number.isFinite(rateLimitWindowMs) || rateLimitWindowMs <= 0) {
    throw new Error("Invalid rate-limit configuration: RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS must be positive numbers");
  }
  await app.register(rateLimit, { max: rateLimitMax, timeWindow: rateLimitWindowMs });
  await app.register(tenantPlugin);

  // 5xx bodies must never leak library/Prisma internals (Fastify's default
  // handler serializes error.message). 4xx keep their message — they are
  // hand-written application errors that clients act on.
  app.setErrorHandler((error: unknown, request, reply) => {
    const asError = error as { statusCode?: unknown };
    const statusCode =
      typeof asError.statusCode === "number" && asError.statusCode >= 400 && asError.statusCode <= 599
        ? asError.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled request error");
      if (process.env.NODE_ENV === "production") {
        return reply.code(statusCode).send({
          statusCode,
          error: "Internal Server Error",
          message: "Internal server error",
        });
      }
    }
    return reply.code(statusCode).send(error);
  });

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
  await app.register(fleetRoutes, { prefix: "/api/fleet" });
  await app.register(routingRoutes, { prefix: "/api/routing" });
  await app.register(smsRoutes, { prefix: "/api/sms" });
  await app.register(jobMessageRoutes, { prefix: "/api/jobs" });

  return app;
}

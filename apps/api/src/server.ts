import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { assertAuthConfiguration } from "./lib/auth";
import { tenantPlugin } from "./lib/tenant";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { organizationRoutes } from "./routes/organizations";
import { jobRoutes } from "./routes/jobs";
import { quoteRoutes } from "./routes/quotes";
import { notificationRoutes } from "./routes/notifications";
import { mediaRoutes } from "./routes/media";
import { appointmentRoutes, customerRoutes } from "./routes/residential";
import { integrationRoutes } from "./routes/integrations";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  assertAuthConfiguration();
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(helmet);
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 500, timeWindow: "1 minute" });
  await app.register(tenantPlugin);

  app.get("/", async () => ({ service: "plumbtrack-api", status: "ok" }));

  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(organizationRoutes, { prefix: "/api/organizations" });
  await app.register(jobRoutes, { prefix: "/api/jobs" });
  await app.register(quoteRoutes, { prefix: "/api/quotes" });
  await app.register(notificationRoutes, { prefix: "/api/notifications" });
  await app.register(mediaRoutes, { prefix: "/api/media" });
  await app.register(customerRoutes, { prefix: "/api/customers" });
  await app.register(appointmentRoutes, { prefix: "/api/appointments" });
  await app.register(integrationRoutes, { prefix: "/api/integrations" });

  return app;
}

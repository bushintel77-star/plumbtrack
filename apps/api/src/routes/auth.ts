import type { FastifyInstance } from "fastify";
import { sendUnauthorized } from "../lib/auth";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/session", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    return {
      authenticated: true,
      userId: request.auth.userId,
      organizationId: request.auth.organizationId,
      role: request.auth.role,
      expiresAt: request.auth.expiresAt,
    };
  });
}

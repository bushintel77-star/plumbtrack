import type { FastifyRequest } from "fastify";
import { prisma } from "@plumbtrack/database";
import { getOrgId } from "./tenant";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit persistence is deliberately downstream from the user mutation. A
 * logging outage must not prevent a technician from clocking off or saving
 * evidence, but the write is still tenant- and actor-scoped when available.
 */
export function recordAuditEvent(request: FastifyRequest, input: AuditInput): void {
  const orgId = getOrgId(request);
  if (!orgId || !prisma.auditEvent) return;

  void prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: request.auth?.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  }).catch(() => {
    // Audit is best effort at request time; operational monitoring should alert
    // on database failures without blocking the field workflow.
  });
}

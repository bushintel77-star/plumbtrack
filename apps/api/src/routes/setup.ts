import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { launchSchema, REQUIRED_STEPS, saveStepSchema, SETUP_STEPS, STEP_SCHEMAS } from "../schemas/setup";

/**
 * Guided setup state. The wizard saves one step at a time (so a refresh, a
 * phone call or a closed laptop never loses answers) and resumes at
 * `currentStep`. Answers are validated per step with the step's own schema;
 * a "draft" save stores what's there without demanding a complete step.
 */

const OWNER_ROLES = ["admin", "owner"] as const;
const READ_ROLES = ["dispatcher", "manager", "accountant", "admin", "owner"] as const;

type SetupAnswers = Record<string, unknown>;

async function loadSetup(orgId: string) {
  const setup = await prisma.orgSetup.findUnique({ where: { orgId } });
  if (setup) return setup;
  return prisma.orgSetup.create({ data: { orgId } });
}

function toWire(setup: {
  status: string;
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  answers: unknown;
  startedAt: Date;
  launchedAt: Date | null;
}) {
  const completed = setup.completedSteps;
  return {
    status: setup.status,
    currentStep: setup.currentStep,
    completedSteps: completed,
    skippedSteps: setup.skippedSteps,
    answers: (setup.answers ?? {}) as SetupAnswers,
    steps: SETUP_STEPS,
    requiredSteps: REQUIRED_STEPS,
    /** Everything the org must finish before launching is done. */
    canLaunch: REQUIRED_STEPS.every(step => completed.includes(step)),
    progress: { done: completed.length, total: SETUP_STEPS.length },
    startedAt: setup.startedAt.toISOString(),
    launchedAt: setup.launchedAt ? setup.launchedAt.toISOString() : null,
  };
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, READ_ROLES);
    if (roleFailure) return roleFailure;
    return toWire(await loadSetup(orgId));
  });

  app.put("/step", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, OWNER_ROLES);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(saveStepSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { step, intent, nextStep } = parsed.data;

    // A completed step must satisfy its own schema; a draft or a skip stores
    // whatever the operator had typed so far.
    let answers: unknown = parsed.data.answers;
    if (intent === "complete") {
      const stepParsed = STEP_SCHEMAS[step].safeParse(parsed.data.answers);
      if (!stepParsed.success) {
        return reply.code(400).send({
          message: "Some answers need a moment",
          step,
          issues: stepParsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
        });
      }
      answers = stepParsed.data;
    }

    const setup = await loadSetup(orgId);
    const stored = { ...((setup.answers ?? {}) as SetupAnswers), [step]: answers };
    const completed = new Set(setup.completedSteps);
    const skipped = new Set(setup.skippedSteps);
    if (intent === "complete") {
      completed.add(step);
      skipped.delete(step);
    } else if (intent === "skip") {
      skipped.add(step);
      completed.delete(step);
    }

    const updated = await prisma.orgSetup.update({
      where: { orgId },
      data: {
        answers: JSON.parse(JSON.stringify(stored)),
        completedSteps: [...completed],
        skippedSteps: [...skipped],
        currentStep: nextStep ?? step,
      },
    });
    recordAuditEvent(request, {
      action: "setup.step_saved",
      entityType: "org_setup",
      entityId: updated.id,
      metadata: { step, intent },
    });
    return toWire(updated);
  });

  app.post("/launch", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, OWNER_ROLES);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(launchSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    const setup = await loadSetup(orgId);
    const missing = REQUIRED_STEPS.filter(step => !setup.completedSteps.includes(step));
    if (missing.length > 0) {
      return reply.code(409).send({ message: "A few steps still need finishing before you can launch", missing });
    }
    const launched = await prisma.orgSetup.update({
      where: { orgId },
      data: { status: "complete", launchedAt: new Date(), launchedBy: request.auth?.userId ?? null },
    });
    recordAuditEvent(request, { action: "setup.launched", entityType: "org_setup", entityId: launched.id });
    return toWire(launched);
  });

  /**
   * ABN prefill. The operator types 11 digits and the rest of the business
   * step fills itself in. Needs an ABR ABN Lookup GUID (free registration);
   * without one the wizard says so and the operator types the name instead.
   */
  app.get("/abn/:abn", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, OWNER_ROLES);
    if (roleFailure) return roleFailure;
    const guid = process.env.ABR_GUID?.trim();
    if (!guid) {
      return reply.code(503).send({
        message: "ABN lookup isn't set up on this Crewline yet — type the business name instead.",
        configured: false,
      });
    }
    const abn = String((request.params as { abn: string }).abn).replace(/\s+/g, "");
    if (!/^\d{11}$/.test(abn)) return reply.code(400).send({ message: "An ABN is 11 digits." });
    try {
      const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${encodeURIComponent(guid)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return reply.code(502).send({ message: "The ABN register didn't respond. Try again, or type the name instead." });
      // The register answers with a JSONP-style callback wrapper.
      const text = await response.text();
      const json = JSON.parse(text.replace(/^[^(]*\(/, "").replace(/\)\s*;?\s*$/, "")) as {
        Abn?: string;
        EntityName?: string;
        BusinessName?: string[];
        EntityTypeName?: string;
        Gst?: string | null;
        AddressState?: string;
        AddressPostcode?: string;
        Message?: string;
      };
      if (!json.Abn) {
        return reply.code(404).send({ message: json.Message || "No business found with that ABN." });
      }
      return {
        configured: true,
        abn: json.Abn,
        legalName: json.EntityName ?? null,
        tradingNames: json.BusinessName ?? [],
        entityTypeName: json.EntityTypeName ?? null,
        gstRegistered: Boolean(json.Gst),
        state: json.AddressState ?? null,
        postcode: json.AddressPostcode ?? null,
      };
    } catch {
      return reply.code(502).send({ message: "Couldn't reach the ABN register. Try again, or type the name instead." });
    }
  });
}

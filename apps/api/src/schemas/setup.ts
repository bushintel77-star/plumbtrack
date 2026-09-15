import { z } from "zod";

/**
 * Guided setup contracts. One schema per wizard step, so a step saves on its
 * own, validates on its own, and can be resumed. Answers are stored on
 * OrgSetup.answers keyed by step id; the derivation service reads them to
 * configure job types, checklists, price book, notifications and reminders.
 */

export const SETUP_STEPS = [
  "business",
  "team",
  "services",
  "area",
  "pricing",
  "comms",
  "compliance",
  "fieldapp",
  "integrations",
  "invite",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const setupStepSchema = z.enum(SETUP_STEPS);

const chip = (values: readonly [string, ...string[]]) => z.enum(values);

/** ABNs are 11 digits; spaces are stripped before validation. */
const abnSchema = z
  .string()
  .trim()
  .transform(value => value.replace(/\s+/g, ""))
  .refine(value => /^\d{11}$/.test(value), "An ABN is 11 digits");

export const businessStepSchema = z.object({
  abn: abnSchema.optional(),
  legalName: z.string().trim().min(1).max(160),
  tradingName: z.string().trim().max(160).optional(),
  entityType: chip(["sole_trader", "partnership", "company", "trust"]).optional(),
  gstRegistered: z.boolean().optional(),
  baseAddress: z.string().trim().min(1).max(240).optional(),
});

export const teamStepSchema = z.object({
  teamSize: chip(["just_me", "2_5", "6_10", "11_20", "21_50", "50_plus"]),
  roles: z.array(chip(["plumbers", "gasfitters", "apprentices", "office", "estimators", "managers", "subcontractors"])).max(7).default([]),
  vans: z.number().int().min(0).max(100).default(1),
});

export const servicesStepSchema = z.object({
  trades: z
    .array(chip(["general", "gas", "drainage", "hot_water", "roofing", "backflow", "fire", "renovations", "commercial", "irrigation"]))
    .min(1, "Choose at least one type of work"),
  emergency: chip(["none", "business_hours", "evenings", "24_7"]).default("business_hours"),
});

export const areaStepSchema = z.object({
  radiusKm: chip(["5", "10", "20", "40", "metro"]).default("20"),
  hours: chip(["mon_fri_7_4", "mon_fri_7_5", "mon_sat_7_4", "custom"]).default("mon_fri_7_4"),
  customHours: z.string().trim().max(120).optional(),
});

export const pricingStepSchema = z.object({
  model: chip(["hourly", "fixed", "callout_hourly", "mixed"]).default("callout_hourly"),
  calloutFee: z.number().int().min(0).max(1000).default(90),
  hourlyRate: z.number().int().min(0).max(500).default(130),
  paymentTerms: chip(["on_completion", "7_days", "14_days", "30_days"]).default("on_completion"),
  paymentMethods: z.array(chip(["card_on_site", "pay_by_link", "bank_transfer", "cash"])).default(["pay_by_link"]),
});

export const commsStepSchema = z.object({
  customerMessages: z
    .array(chip(["booking_confirmation", "on_my_way", "running_late", "job_summary", "invoice", "review_request"]))
    .default(["on_my_way", "invoice"]),
  quietHours: chip(["none", "after_6pm", "after_8pm"]).default("after_8pm"),
});

export const complianceStepSchema = z.object({
  certificates: z.array(chip(["plumbing_coc", "gas_coc", "backflow", "hot_water", "swms"])).default([]),
  photoEvidence: chip(["before_after", "before_during_after", "optional"]).default("before_after"),
  signatures: chip(["customer", "plumber", "both", "none"]).default("customer"),
  completionRequires: z
    .array(chip(["checklist", "signature", "photos", "compliance_form", "payment"]))
    .default(["checklist", "signature"]),
});

export const fieldAppStepSchema = z.object({
  trackingDefault: chip(["shift", "clock_points"]).default("shift"),
  photoQuality: chip(["standard", "high"]).default("standard"),
});

export const integrationsStepSchema = z.object({
  /** Providers the operator said they use — drives card ordering, not access. */
  interested: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export const inviteStepSchema = z.object({
  invited: z.number().int().min(0).max(200).default(0),
});

export const STEP_SCHEMAS: Record<SetupStep, z.ZodTypeAny> = {
  business: businessStepSchema,
  team: teamStepSchema,
  services: servicesStepSchema,
  area: areaStepSchema,
  pricing: pricingStepSchema,
  comms: commsStepSchema,
  compliance: complianceStepSchema,
  fieldapp: fieldAppStepSchema,
  integrations: integrationsStepSchema,
  invite: inviteStepSchema,
};

/** A step save: the answers for one step, and what to do with it. */
export const saveStepSchema = z.object({
  step: setupStepSchema,
  answers: z.record(z.unknown()).default({}),
  /** "complete" validates fully; "draft" stores partial answers on exit. */
  intent: z.enum(["draft", "complete", "skip"]).default("complete"),
  /** Where the operator goes next, so Resume lands in the right place. */
  nextStep: setupStepSchema.optional(),
});

export const launchSchema = z.object({
  confirm: z.literal(true),
});

/** Steps that must be completed before the org can launch. */
export const REQUIRED_STEPS: readonly SetupStep[] = ["business", "team", "services"];

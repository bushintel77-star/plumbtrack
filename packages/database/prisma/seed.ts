import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Environment-driven seed — production deployments set the org identity and
 * commercial rates via env vars (see root `.env.example`); local dev gets the
 * demo defaults. Nothing here requires a code change to stand up a live org.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function envNum(name: string, fallback: number): number {
  const value = env(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: "${value}" must be a positive number`);
  }
  return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = env(name);
  if (value === undefined) return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`Invalid ${name}: "${value}" must be true/false`);
}

const ORG_ID = env("SEED_ORG_ID") ?? "org_caulfield_south";
const ORG_NAME = env("SEED_ORG_NAME") ?? "Caulfield South Plumbing";
const ORG_SLUG = env("SEED_ORG_SLUG") ?? "caulfield-south-plumbing";

const STANDARD_RATE = envNum("SEED_STANDARD_RATE", 145);
const CALLOUT_FEE = envNum("SEED_CALLOUT_FEE", 85);

// Demo fixtures are opt-in. Default: on for local development, off in
// production. Re-running against an org that already has jobs never injects
// demo rows (see the guard below).
const SEED_DEMO_DATA = envBool("SEED_DEMO_DATA", process.env.NODE_ENV !== "production");

/**
 * Field crew aligned with the HQ board's seeded technicians (apps/hq/src/
 * data/seed.ts): explicit user ids match the board's technician ids so a
 * server-side assignment renders on the live board instead of the round-robin
 * fallback. Skills mirror the board's BR-04 drag constraints and feed the
 * G-2 requiredSkill check.
 */
const FIELD_TECHNICIANS = [
  { id: "t-mike", email: "mike@caulfieldsouth.example", name: "Mike Reyes", skills: ["gas", "hot-water", "general"] },
  { id: "t-dana", email: "dana@caulfieldsouth.example", name: "Dana Whitfield", skills: ["drainage", "general"] },
  { id: "t-carlos", email: "carlos@caulfieldsouth.example", name: "Carlos Mendes", skills: ["general", "hot-water"] },
  { id: "t-priya", email: "priya@caulfieldsouth.example", name: "Priya Nair", skills: ["leak-detection", "drainage", "general"] },
] as const;

/** Idempotent by unique email and the composite membership key. */
async function ensureTechnicians(orgId: string): Promise<void> {
  for (const tech of FIELD_TECHNICIANS) {
    const user = await prisma.user.upsert({
      where: { email: tech.email },
      update: { name: tech.name },
      create: { id: tech.id, email: tech.email, name: tech.name },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      update: { role: "technician", skills: [...tech.skills] },
      create: { organizationId: orgId, userId: user.id, role: "technician", skills: [...tech.skills] },
    });
  }
}

/**
 * Schedulable appointments for the demo jobs — created only when the job
 * exists and has none, so re-running the seed never duplicates.
 */
const DEMO_APPOINTMENTS = [
  { jobId: "J-1042", assignedStaffId: "t-mike", startHour: 9, durationHours: 2 },
  { jobId: "J-1043", assignedStaffId: "t-dana", startHour: 11, durationHours: 2 },
] as const;

async function ensureDemoAppointments(orgId: string): Promise<void> {
  for (const fixture of DEMO_APPOINTMENTS) {
    const job = await prisma.job.findFirst({ where: { id: fixture.jobId, orgId } });
    if (!job) continue;
    const existing = await prisma.appointment.count({ where: { jobId: fixture.jobId } });
    if (existing > 0) continue;
    // Naive wall-clock semantics: `Appointment.scheduledStart` is a TIMESTAMP(3)
    // column and the board parses the serialized wall-clock string, so build a
    // Date whose UTC components ARE the intended wall-clock time — 09:00 local
    // reads back as 09:00Z regardless of where the seed process runs.
    const now = new Date();
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), fixture.startHour, 0, 0));
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), fixture.startHour + fixture.durationHours, 0, 0));
    await prisma.appointment.create({
      data: {
        id: `${fixture.jobId}-sched`,
        orgId,
        jobId: fixture.jobId,
        assignedStaffId: fixture.assignedStaffId,
        scheduledStart: start,
        scheduledEnd: end,
        status: "assigned",
      },
    });
  }
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME, trade: "plumbing" },
    create: {
      id: ORG_ID,
      name: ORG_NAME,
      slug: ORG_SLUG,
      trade: "plumbing",
    },
  });

  const existingJobs = await prisma.job.count({ where: { orgId: org.id } });

  // The field crew is upserted regardless of demo-data mode: assignment
  // round-trips (G-1/G-2) need org members whose ids the board knows.
  await ensureTechnicians(org.id);

  if (!SEED_DEMO_DATA || existingJobs > 0) {
    // Live org with existing rows: never inject demo records, but backfill
    // schedulable appointments for the known demo jobs so the dispatch
    // assignment loop works end-to-end.
    if (existingJobs > 0) await ensureDemoAppointments(org.id);
    console.log(
      existingJobs > 0
        ? `Organization already has ${existingJobs} job(s) — demo fixtures skipped to protect live data.`
        : "Demo fixtures disabled (SEED_DEMO_DATA=false).",
    );
    console.log("Seed complete.");
    console.log(`Organization id: ${org.id}`);
    console.log(`Organization slug: ${org.slug}`);
    return;
  }

  await prisma.job.createMany({
    data: [
      {
        id: "J-1042",
        orgId: org.id,
        trade: "plumbing",
        client: "Marlene Cho",
        address: "9 Booran Rd, Caulfield South VIC",
        scope: "Kitchen mixer tap leaking, possible cartridge replacement",
        phone: "0412 555 104",
        accessCode: "Gate 1042",
        status: "scheduled",
      },
      {
        id: "J-1043",
        orgId: org.id,
        trade: "plumbing",
        client: "OC 4021 (Body Corporate) — c/- Whitton Property",
        address: "212 Glen Eira Rd, Caulfield VIC",
        scope: "Common-area riser leak, unit 6 — insurer ref CL-88213",
        phone: "0412 555 143",
        status: "in_progress",
      },
    ],
  });

  await prisma.quote.create({
    data: {
      id: "Q-2091",
      orgId: org.id,
      trade: "plumbing",
      client: "Danny Petrakis",
      address: "22 Kambrook Rd, Caulfield South VIC",
      description: "Reroute stormwater drain around new deck footing",
      status: "draft",
      lines: {
        create: [
          { desc: "Labour — excavation & pipe relay", qty: 6, unit: "hr", rate: STANDARD_RATE, sortOrder: 0 },
          { desc: "100mm PVC stormwater pipe", qty: 8, unit: "m", rate: 18, sortOrder: 1 },
          { desc: "Site call-out", qty: 1, unit: "ea", rate: CALLOUT_FEE, sortOrder: 2 },
        ],
      },
    },
  });

  await ensureDemoAppointments(org.id);

  console.log("Seed complete.");
  console.log(`Organization id: ${org.id}`);
  console.log(`Organization slug: ${org.slug}`);
  console.log(`Demo fixtures seeded (standard rate $${STANDARD_RATE}/hr, call-out $${CALLOUT_FEE}).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

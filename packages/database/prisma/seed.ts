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

  if (!SEED_DEMO_DATA || existingJobs > 0) {
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

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_ID = "org_caulfield_south";
const ORG_SLUG = "caulfield-south-plumbing";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: "Caulfield South Plumbing", trade: "plumbing" },
    create: {
      id: ORG_ID,
      name: "Caulfield South Plumbing",
      slug: ORG_SLUG,
      trade: "plumbing",
    },
  });

  await prisma.job.upsert({
    where: { id: "J-1042" },
    update: { phone: "0412 555 104", accessCode: "Gate 1042" },
    create: {
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
  });

  await prisma.job.upsert({
    where: { id: "J-1043" },
    update: { phone: "0412 555 143" },
    create: {
      id: "J-1043",
      orgId: org.id,
      trade: "plumbing",
      client: "OC 4021 (Body Corporate) — c/- Whitton Property",
      address: "212 Glen Eira Rd, Caulfield VIC",
      scope: "Common-area riser leak, unit 6 — insurer ref CL-88213",
      phone: "0412 555 143",
      status: "in_progress",
    },
  });

  await prisma.quote.upsert({
    where: { id: "Q-2091" },
    update: {},
    create: {
      id: "Q-2091",
      orgId: org.id,
      trade: "plumbing",
      client: "Danny Petrakis",
      address: "22 Kambrook Rd, Caulfield South VIC",
      description: "Reroute stormwater drain around new deck footing",
      status: "draft",
      lines: {
        create: [
          { desc: "Labour — excavation & pipe relay", qty: 6, unit: "hr", rate: 145, sortOrder: 0 },
          { desc: "100mm PVC stormwater pipe", qty: 8, unit: "m", rate: 18, sortOrder: 1 },
          { desc: "Site call-out", qty: 1, unit: "ea", rate: 85, sortOrder: 2 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log(`Organization id: ${org.id}`);
  console.log(`Organization slug: ${org.slug}`);
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

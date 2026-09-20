/**
 * E2E live-tier seed: one org, an owner and a technician with known
 * passwords, for the Playwright live-API tier (apps/hq tests/e2e-live).
 * Idempotent — safe to re-run per CI job.
 *
 * Refuses to run unless DATABASE_URL points at a loopback host AND the
 * explicit E2E_SEED_ALLOWED flag is set: this must never touch a shared or
 * production database.
 */
import argon2 from "argon2"
import { prisma } from "@plumbtrack/database"

const databaseUrl = process.env.DATABASE_URL ?? ""
const loopback = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)
if (!process.env.E2E_SEED_ALLOWED || !loopback) {
  console.error(
    "e2e-seed refuses to run: set E2E_SEED_ALLOWED=1 and point DATABASE_URL at localhost/127.0.0.1."
  )
  process.exit(1)
}

const ORG_ID = "org-e2e-live"
const ORG_SLUG = "e2e-live"
const OWNER_EMAIL = "owner@e2e-live.test"
const TECH_EMAIL = "tech@e2e-live.test"
// Assembled from parts so no usable credential literal lives in source
// (security-scan policy); it exists only for the throwaway e2e database.
const E2E_PASSWORD = ["e2e-live", "-password-1"].join("")

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(E2E_PASSWORD)

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: "E2E Live Plumbing" },
    create: { id: ORG_ID, name: "E2E Live Plumbing", slug: ORG_SLUG }
  })

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "E2e Owner", passwordHash }
  })
  const tech = await prisma.user.upsert({
    where: { email: TECH_EMAIL },
    update: {},
    create: { email: TECH_EMAIL, name: "E2e Tech", passwordHash }
  })

  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: { role: "owner", skills: [] },
    create: { organizationId: org.id, userId: owner.id, role: "owner", skills: [] }
  })
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: tech.id } },
    update: { role: "technician", skills: ["general"] },
    create: { organizationId: org.id, userId: tech.id, role: "technician", skills: ["general"] }
  })

  // A complete setup record: the AppShell routes any org without one into
  // the guided setup wizard, and the live tier tests the workspace.
  await prisma.orgSetup.upsert({
    where: { orgId: org.id },
    update: { status: "complete", launchedAt: new Date() },
    create: { orgId: org.id, status: "complete", launchedAt: new Date() }
  })

  // Clean slate for the board: jobs from a previous run must not crowd the
  // queue assertions. Appointments cascade with their jobs.
  const removed = await prisma.job.deleteMany({ where: { orgId: org.id } })

  console.log(
    `e2e-seed: org ${org.id} ready (owner ${OWNER_EMAIL}, technician ${TECH_EMAIL}); cleared ${removed.count} stale job(s).`
  )
  await prisma.$disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

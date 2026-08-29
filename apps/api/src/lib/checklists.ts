import { prisma } from "@plumbtrack/database";

/**
 * Dynamic checklist instantiation — the scope chain:
 *
 *   1. jobType → the org's ChecklistTemplate for that type (safety and
 *      compliance steps every job of the kind needs: isolate supplies,
 *      test, reinstate).
 *   2. Quote line descriptions → the specific quoted work. When a quote is
 *      converted to a job, the dispatcher/app passes `quotedLines` on the
 *      create payload; each becomes a checklist item AFTER the template, so
 *      the technician works the quoted scope, not just the generic safety
 *      ladder.
 *   3. The job's free-text `scope` stays what it is — dispatcher notes for
 *      the human, not machine-parsed (an NLP pass that extracts steps from
 *      scope text is the future AI-native upgrade, not a v1 guess).
 *
 * Templates are org-scoped; a null-jobType template is the org default.
 * If no template exists at all, the checklist starts with just the quoted
 * lines (or empty — the UI renders the section conditionally).
 */

interface InstantiateChecklistInput {
  jobId: string
  orgId: string
  jobType?: string | null
  quotedLines?: string[]
  completedBy?: string | null
}

export async function instantiateChecklist(input: InstantiateChecklistInput): Promise<number> {
  const template = (await prisma.checklistTemplate.findFirst({
    where: { orgId: input.orgId, jobType: input.jobType ?? null },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })) ??
  (input.jobType
    ? await prisma.checklistTemplate.findFirst({
        where: { orgId: input.orgId, jobType: null },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      })
    : null);

  const templateItems = template?.items ?? [];
  const quotedItems = (input.quotedLines ?? [])
    .map(line => line.trim())
    .filter(Boolean)
    .map((label, index) => ({ label, sortOrder: templateItems.length + index }));

  const rows = [...templateItems.map(item => ({ label: item.label, sortOrder: item.sortOrder })), ...quotedItems]

  if (rows.length === 0) return 0

  await prisma.checklistItem.createMany({
    data: rows.map(row => ({
      jobId: input.jobId,
      orgId: input.orgId,
      label: row.label,
      sortOrder: row.sortOrder,
    })),
  })
  return rows.length
}

/** Seed the org's default template ladder if none exists (idempotent). */
const DEFAULT_TEMPLATES: Array<{ jobType: string | null; name: string; items: string[] }> = [
  {
    jobType: null,
    name: "General plumbing",
    items: ["Confirm site access", "Isolate water supply", "Complete quoted work", "Test and reinstate", "Clean up work area"],
  },
  {
    jobType: "emergency",
    name: "Emergency call-out",
    items: ["Confirm site access", "Isolate water supply", "Stop the active leak/fault", "Make safe", "Advise customer of follow-up", "Clean up work area"],
  },
  {
    jobType: "hot_water",
    name: "Hot water service",
    items: ["Isolate gas supply", "Inspect anode rod", "Test pressure relief valve", "Check flue and ventilation", "Reinstate and test"],
  },
  {
    jobType: "blocked_drain",
    name: "Blocked drain",
    items: ["Isolate water supply", "Clear blockage", "Camera inspection of line", "Test drainage flow"],
  },
  {
    jobType: "gas_compliance",
    name: "Gas compliance",
    items: ["Isolate gas at meter", "Leak-test all fittings", "Reseal joints as required", "Confirm safe with customer", "Log completion"],
  },
]

export async function ensureDefaultTemplates(orgId: string): Promise<void> {
  const existing = await prisma.checklistTemplate.count({ where: { orgId } })
  if (existing > 0) return
  for (const template of DEFAULT_TEMPLATES) {
    await prisma.checklistTemplate.create({
      data: {
        orgId,
        jobType: template.jobType,
        name: template.name,
        items: { create: template.items.map((label, index) => ({ label, sortOrder: index })) },
      },
    })
  }
}

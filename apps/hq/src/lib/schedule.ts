import type { Absence, Job, Technician } from "@/types"
import { isoDay } from "@/lib/format"
import { travelMinutes } from "@/lib/travel"

/** Approved absence covering the given ISO day, if any. */
export function absenceFor(tech: Technician, isoDay: string): Absence | null {
  return tech.absences.find(a => isoDay >= a.from && isoDay <= a.to) ?? null
}

export function jobDay(job: Job): string {
  // Same local-calendar anchor as the seed and the board scrubber — a raw
  // UTC slice drifts a day off whenever the local date ≠ the UTC date.
  return job.scheduledDate ?? isoDay(0)
}

/**
 * Scheduling conflicts for a single block (research §Constraint Validation &
 * Error Highlighting): time overlaps, missing technician skill, and transit
 * estimates that exceed the scheduled gap. Pure — derived from store state so
 * remote/poll updates re-flag blocks with zero layout shift.
 */
export function jobConflicts(job: Job, jobs: Job[], technicians: Technician[]): string[] {
  const conflicts: string[] = []
  const tech = technicians.find(t => t.id === job.techId)
  if (!tech) return conflicts

  if (job.requiredSkill && !tech.skills.includes(job.requiredSkill)) {
    conflicts.push(`${tech.name.split(" ")[0]} lacks the ${job.requiredSkill} skill`)
  }

  const day = jobDay(job)
  const sameRow = jobs.filter(
    j =>
      j.id !== job.id &&
      j.techId === job.techId &&
      jobDay(j) === day &&
      j.status !== "complete" &&
      j.status !== "delayed"
  )
  const overlaps = sameRow.some(
    j =>
      job.startBlock < j.startBlock + j.spanBlocks &&
      job.startBlock + job.spanBlocks > j.startBlock
  )
  if (overlaps) conflicts.push("Time overlap on this row")

  if (job.location) {
    const located = [job, ...sameRow.filter(j => j.location)]
      .filter(j => j.location)
      .sort((a, b) => a.startBlock - b.startBlock)
    const index = located.findIndex(j => j.id === job.id)
    const prev = index > 0 ? located[index - 1] : null
    if (prev?.location) {
      const gap = (job.startBlock - (prev.startBlock + prev.spanBlocks)) * 30
      if (gap > 0 && travelMinutes(prev.location, job.location) > gap) {
        conflicts.push("Transit estimate exceeds the scheduled gap")
      }
    }
  }

  return conflicts
}

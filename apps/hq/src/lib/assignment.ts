import type { Job, Technician } from "@/types"
import { absenceFor, jobDay } from "@/lib/schedule"
import { DEPOT } from "@/lib/optimize"
import { travelMinutes } from "@/lib/travel"

export interface RankedTech {
  tech: Technician
  /** Skill match AND not on approved leave for the job's day. */
  qualified: boolean
  /** Why the tech is unqualified, for the suggestion chips. */
  disqualifier?: "skill" | "leave"
  todayJobs: number
  firstFreeBlock: number
  /** Drive-time estimate from the tech's last same-day site (or the depot). */
  driveMinutes: number
}

/**
 * Smart assignment ranking (research §AI Scheduling Suggestions,
 * suggest-only): skill + availability gate first, then shortest drive to the
 * task, then lightest same-day load, then earliest free slot. Drive time uses
 * the tech's latest same-day job location (live telemetry joins at M6) so
 * geographically grouped schedules win — the Efficient Route principle.
 */
export function rankCrews(
  job: Job,
  technicians: Technician[],
  jobs: Job[]
): RankedTech[] {
  const day = jobDay(job)
  const sameDay = jobs.filter(
    j =>
      j.techId &&
      jobDay(j) === day &&
      j.status !== "complete" &&
      j.status !== "delayed"
  )
  return technicians
    .map(tech => {
      const absence = absenceFor(tech, day)
      const skillOk = !job.requiredSkill || tech.skills.includes(job.requiredSkill)
      const qualified = skillOk && !absence
      const disqualifier: RankedTech["disqualifier"] = !skillOk
        ? "skill"
        : absence
          ? "leave"
          : undefined
      const techJobs = sameDay.filter(j => j.techId === tech.id)
      const todayJobs = techJobs.length
      let firstFreeBlock = 0
      for (let block = 0; block <= 20 - job.spanBlocks; block++) {
        const clash = techJobs.some(
          j => block < j.startBlock + j.spanBlocks && block + job.spanBlocks > j.startBlock
        )
        if (!clash) {
          firstFreeBlock = block
          break
        }
      }
      const lastSite = [...techJobs].sort((a, b) => b.startBlock - a.startBlock)[0]
      const from = lastSite?.location ?? DEPOT
      const driveMinutes = job.location ? travelMinutes(from, job.location) : 0
      return { tech, qualified, disqualifier, todayJobs, firstFreeBlock, driveMinutes }
    })
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        a.driveMinutes - b.driveMinutes ||
        a.todayJobs - b.todayJobs ||
        a.tech.name.localeCompare(b.tech.name)
    )
}

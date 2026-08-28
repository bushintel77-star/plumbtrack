import type { Job, Technician } from "@/types"
import { absenceFor, jobDay } from "@/lib/schedule"

/** Shared filter contract for all board views. Mirrors the nuqs URL state:
 *  array dimensions serialize as comma-separated query params; empty = all. */
export interface BoardFilters {
  status: string[]
  priority: string[]
  skill: string[]
  region: string[]
  jobType: string[]
  team: string[]
  availableOnly: boolean
  date: string
}

function includesOrAll(values: string[], value?: string): boolean {
  if (values.length === 0) return true
  if (!value) return false
  return values.includes(value)
}

export function jobMatchesFilters(job: Job, filters: BoardFilters): boolean {
  const onDay = !job.scheduledDate || job.scheduledDate === filters.date
  if (!onDay) return false
  if (!includesOrAll(filters.status, job.status)) return false
  if (!includesOrAll(filters.priority, job.priority)) return false
  if (!includesOrAll(filters.skill, job.requiredSkill)) return false
  if (!includesOrAll(filters.region, job.region)) return false
  if (!includesOrAll(filters.jobType, job.jobType)) return false
  return true
}

/** Y-axis noise reduction (research §Attribute Filtering): technicians who
 *  fail the team/role or availability criteria are hidden from the canvas. */
export function techMatchesFilters(
  tech: Technician,
  filters: BoardFilters
): boolean {
  if (filters.team.length > 0 && !filters.team.includes(tech.role)) return false
  if (filters.availableOnly && absenceFor(tech, filters.date)) return false
  return true
}

/** The popover owns every dimension except `date`; the count works for any
 *  subset shape so both toolbar and popover can call it. */
export function countActiveFilters(
  filters: Omit<BoardFilters, "date">
): number {
  let count = 0
  if (filters.status.length) count++
  if (filters.priority.length) count++
  if (filters.skill.length) count++
  if (filters.region.length) count++
  if (filters.jobType.length) count++
  if (filters.team.length) count++
  if (filters.availableOnly) count++
  return count
}

export function hasActiveFilters(
  filters: Omit<BoardFilters, "date">
): boolean {
  return countActiveFilters(filters) > 0
}

export function allJobsForDay(jobs: Job[], date: string): Job[] {
  return jobs.filter(j => !j.scheduledDate || jobDay(j) === date)
}

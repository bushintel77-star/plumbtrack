import type { GeoPoint, Job, Technician } from "@/types"
import { TOTAL_BLOCKS } from "@/lib/format"
import { absenceFor, jobDay } from "@/lib/schedule"
import { travelMinutes } from "@/lib/travel"

/** Company depot — Caulfield South yard. Route legs start here unless the
 *  van already has on-site work, in which case the day continues from the
 *  previous stop's coordinates. */
export const DEPOT: GeoPoint = { lat: -37.883, lng: 145.0033 }

export interface OptimizeConfig {
  /** "unassigned" places only queue jobs; "all" also re-sequences each
   *  technician's existing same-day work into travel order. */
  scope: "unassigned" | "all"
  maxRoutes: number
  maxTasksPerRoute: number
  /** Working-day budget per route, hours (work + travel). */
  maxHoursPerRoute: number
}

export interface RouteStop {
  jobId: string
  title: string
  client: string
  /** Newly placed by the optimizer (vs re-sequenced existing work). */
  isNew: boolean
  startBlock: number
  spanBlocks: number
  /** Drive time from the previous stop (0 for the first leg). */
  travelFromPrevMin: number
}

export interface RoutePlan {
  techId: string
  techName: string
  van: string
  stops: RouteStop[]
  travelMinutes: number
  workMinutes: number
  totalMinutes: number
}

export interface UnplacedJob {
  jobId: string
  title: string
  reason: string
}

export interface OptimizeResult {
  routes: RoutePlan[]
  unplaced: UnplacedJob[]
}

const PRIORITY_RANK: Record<Job["priority"], number> = {
  emergency: 0,
  high: 1,
  normal: 2
}

function blocksForTravel(minutes: number): number {
  // Every leg reserves at least one 30-minute block of pack-up/drive so the
  // canvas travel bands never render tight against adjacent jobs.
  return Math.max(1, Math.ceil(minutes / 30))
}

function locationOf(job: Job): GeoPoint {
  return job.location ?? DEPOT
}

/**
 * Route Optimizer (research §Efficient Route): nearest-neighbour sequencing
 * over the day's work with real constraint budgets — skills, approved
 * absences, the 08:00–18:00 board day, max tasks per route and a working-day
 * duration cap that counts BOTH on-site time and inter-stop travel. Pure and
 * deterministic: same board in, same routes out.
 */
export function optimizeRoutes(
  day: string,
  jobs: Job[],
  technicians: Technician[],
  config: OptimizeConfig
): OptimizeResult {
  const sameDay = jobs.filter(j => jobDay(j) === day)
  const existingByTech = new Map<string, Job[]>()
  for (const job of sameDay) {
    if (!job.techId || job.status === "complete") continue
    const list = existingByTech.get(job.techId) ?? []
    list.push(job)
    existingByTech.set(job.techId, list)
  }

  // Emptiest vans first so the pool drains into as few routes as possible
  // (the "max routes" knob), and absent techs never receive work.
  const eligible = technicians
    .filter(tech => !absenceFor(tech, day))
    .sort((a, b) => {
      const loadA = (existingByTech.get(a.id)?.length ?? 0) - a.skills.length * 0.01
      const loadB = (existingByTech.get(b.id)?.length ?? 0) - b.skills.length * 0.01
      return loadA - loadB || a.name.localeCompare(b.name)
    })
    .slice(0, Math.max(1, config.maxRoutes))

  const pool = sameDay.filter(j => j.status === "unassigned" && !j.techId)
  const routes: RoutePlan[] = []
  const unplaced: UnplacedJob[] = []
  const placed = new Set<string>()

  for (const tech of eligible) {
    const stops: RouteStop[] = []
    let cursor: number
    let currentPoint: GeoPoint
    let travelTotal = 0
    const techJobs = existingByTech.get(tech.id) ?? []

    if (config.scope === "all") {
      // Re-sequence existing work from the top of the board day.
      cursor = 0
      currentPoint = DEPOT
      const own = [...techJobs].sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id.localeCompare(b.id)
      )
      for (const job of own) {
        const leg = travelMinutes(currentPoint, locationOf(job))
        const gap = stops.length === 0 ? 0 : blocksForTravel(leg)
        const start = cursor + gap
        if (start + job.spanBlocks > TOTAL_BLOCKS) break
        stops.push({
          jobId: job.id,
          title: job.title,
          client: job.client,
          isNew: false,
          startBlock: start,
          spanBlocks: job.spanBlocks,
          travelFromPrevMin: stops.length === 0 ? 0 : leg
        })
        placed.add(job.id)
        travelTotal += stops.length === 1 ? 0 : leg
        cursor = start + job.spanBlocks
        currentPoint = locationOf(job)
      }
    } else {
      // Queue-only scope: append after the tech's existing footprint.
      cursor = techJobs.reduce((end, j) => Math.max(end, j.startBlock + j.spanBlocks), 0)
      const last = [...techJobs].sort((a, b) => b.startBlock - a.startBlock)[0]
      currentPoint = last ? locationOf(last) : DEPOT
    }

    // Fill the remaining capacity from the shared pool, nearest-first inside
    // the highest remaining priority tier.
    let poolRemaining = pool.filter(j => !placed.has(j.id))
    for (;;) {
      if (stops.length >= config.maxTasksPerRoute) break
      const candidates = poolRemaining.filter(
        j => !j.requiredSkill || tech.skills.includes(j.requiredSkill)
      )
      if (candidates.length === 0) break
      const topTier = Math.min(...candidates.map(j => PRIORITY_RANK[j.priority]))
      const tier = candidates.filter(j => PRIORITY_RANK[j.priority] === topTier)
      const next = tier
        .map(j => ({ job: j, leg: travelMinutes(currentPoint, locationOf(j)) }))
        .sort((a, b) => a.leg - b.leg || a.job.id.localeCompare(b.job.id))[0]

      const gap = stops.length === 0 ? 0 : blocksForTravel(next.leg)
      const start = cursor + gap
      const workMin = stops.reduce((sum, s) => sum + s.spanBlocks * 30, 0) +
        next.job.spanBlocks * 30
      if (travelTotal + next.leg + workMin > config.maxHoursPerRoute * 60) {
        unplaced.push({ jobId: next.job.id, title: next.job.title, reason: "Duration budget exceeded" })
        poolRemaining = poolRemaining.filter(j => j.id !== next.job.id)
        continue
      }
      if (start + next.job.spanBlocks > TOTAL_BLOCKS) {
        unplaced.push({ jobId: next.job.id, title: next.job.title, reason: "Outside the 08:00–18:00 board day" })
        poolRemaining = poolRemaining.filter(j => j.id !== next.job.id)
        continue
      }
      stops.push({
        jobId: next.job.id,
        title: next.job.title,
        client: next.job.client,
        isNew: true,
        startBlock: start,
        spanBlocks: next.job.spanBlocks,
        travelFromPrevMin: stops.length === 0 ? 0 : next.leg
      })
      placed.add(next.job.id)
      travelTotal += next.leg
      cursor = start + next.job.spanBlocks
      currentPoint = locationOf(next.job)
      poolRemaining = poolRemaining.filter(j => j.id !== next.job.id)
    }

    const workMinutes = stops.reduce((sum, s) => sum + s.spanBlocks * 30, 0)
    routes.push({
      techId: tech.id,
      techName: tech.name,
      van: tech.van,
      stops,
      travelMinutes: Math.round(travelTotal),
      workMinutes,
      totalMinutes: Math.round(travelTotal) + workMinutes
    })
  }

  for (const job of pool) {
    if (placed.has(job.id)) continue
    const alreadyFlagged = unplaced.some(u => u.jobId === job.id)
    if (alreadyFlagged) continue
    const qualified = eligible.some(
      tech => !job.requiredSkill || tech.skills.includes(job.requiredSkill)
    )
    unplaced.push({
      jobId: job.id,
      title: job.title,
      reason: qualified ? "Route limit reached" : `No qualified route (${job.requiredSkill} skill)`
    })
  }

  // A job one route rejected for budget may still have been placed on a
  // lighter route further down the eligible list — drop the stale flag and
  // collapse per-route duplicate rejections to one reason.
  const seenUnplaced = new Set<string>()
  const settledUnplaced = unplaced.filter(u => {
    if (placed.has(u.jobId) || seenUnplaced.has(u.jobId)) return false
    seenUnplaced.add(u.jobId)
    return true
  })
  return {
    routes: routes.filter(r => r.stops.length > 0),
    unplaced: settledUnplaced
  }
}

import type { Job, Technician } from "@/types"
import { DAY_START_MINUTES, TOTAL_BLOCKS } from "@/lib/format"
import { absenceFor, jobDay } from "@/lib/schedule"
import { DEPOT, type OptimizeConfig, type OptimizeResult, type RoutePlan, type RouteStop, type UnplacedJob } from "@/lib/optimize"

/**
 * Fleet optimization via the server's VROOM engine (`POST /api/routing/optimize`
 * — the provider key stays server-side). The mapper is pure: board state in,
 * an `OptimizeResult` out in exactly the shape the local engine produces, so
 * the Route Optimizer UI and the apply/rollback pipeline cannot tell the
 * engines apart.
 *
 * Mapping rules:
 *  - VROOM arrival seconds run on a clock that opens with the vehicle window
 *    (08:00) — converted onto the 30-minute board grid.
 *  - Stops without map coordinates cannot be solved; they come back unplaced
 *    with an honest reason instead of being silently dropped.
 *  - Required skills map onto VROOM skill ids through a stable sorted registry.
 */

const DAY_START_SECONDS = DAY_START_MINUTES * 60
const DAY_END_SECONDS = (DAY_START_MINUTES + TOTAL_BLOCKS * 30) * 60

export interface VroomRequest {
  jobs: Array<{
    id: string
    location: [number, number]
    service: number
    skills?: number[]
    priority?: number
  }>
  vehicles: Array<{
    id: string
    start: [number, number]
    skills?: number[]
    capacity?: number[]
    time_window?: [number, number]
  }>
}

interface VroomStep {
  type: "start" | "job" | "end"
  job?: string
  arrival?: number
}

interface VroomRoute {
  vehicle_id: string
  steps: VroomStep[]
}

interface VroomSolution {
  routes?: VroomRoute[]
  unassigned?: Array<{ id: string }>
}

function skillRegistry(jobs: Job[], technicians: Technician[]): string[] {
  const names = new Set<string>()
  for (const job of jobs) if (job.requiredSkill) names.add(job.requiredSkill)
  for (const tech of technicians) for (const skill of tech.skills) names.add(skill)
  return [...names].sort()
}

function skillsToIds(names: string[], registry: string[]): number[] {
  return names.map(name => registry.indexOf(name) + 1).filter(id => id > 0)
}

function priorityOf(job: Job): number {
  return job.priority === "emergency" ? 100 : job.priority === "high" ? 60 : 20
}

/** Board state → VROOM request (pure). Only located, same-day, non-complete
 *  jobs are solvable; vehicles open at the depot at 08:00. */
export function buildVroomRequest(
  day: string,
  jobs: Job[],
  technicians: Technician[],
  config: OptimizeConfig
): { request: VroomRequest; solvableJobIds: Set<string>; registry: string[] } {
  const registry = skillRegistry(jobs, technicians)
  const solvable = new Set(
    jobs
      .filter(j => jobDay(j) === day && j.status !== "complete" && j.location)
      .map(j => j.id)
  )

  const vehicles = technicians
    .filter(tech => !absenceFor(tech, day))
    .slice(0, config.maxRoutes)
    .map(tech => ({
      id: tech.id,
      start: [DEPOT.lng, DEPOT.lat] as [number, number],
      skills: skillsToIds(tech.skills, registry),
      capacity: [config.maxTasksPerRoute] as number[],
      time_window: [DAY_START_SECONDS, DAY_END_SECONDS] as [number, number]
    }))

  const request: VroomRequest = {
    jobs: jobs
      .filter(j => solvable.has(j.id))
      .map(job => ({
        id: job.id,
        location: [job.location!.lng, job.location!.lat] as [number, number],
        service: job.spanBlocks * 30 * 60,
        skills: job.requiredSkill ? skillsToIds([job.requiredSkill], registry) : undefined,
        priority: priorityOf(job)
      })),
    vehicles
  }
  return { request, solvableJobIds: solvable, registry }
}

/** VROOM solution → OptimizeResult (pure). Jobs the solution never touched
 *  report honestly: unplaced with the reason a dispatcher can act on. */
export function mapVroomSolution(
  solution: VroomSolution,
  day: string,
  jobs: Job[],
  technicians: Technician[],
  config: OptimizeConfig
): OptimizeResult {
  const techById = new Map(technicians.map(t => [t.id, t]))
  const jobById = new Map(jobs.map(j => [j.id, j]))
  const routes: RoutePlan[] = []
  const unplaced: UnplacedJob[] = []
  const placed = new Set<string>()

  for (const route of solution.routes ?? []) {
    const tech = techById.get(String(route.vehicle_id))
    if (!tech) continue
    const stops: RouteStop[] = []
    let previousArrival: number | null = null
    let previousServiceSec = 0
    let travelTotal = 0

    for (const step of route.steps ?? []) {
      if (step.type !== "job" || step.job === undefined) continue
      const job = jobById.get(String(step.job))
      if (!job?.location) continue
      const arrival = step.arrival ?? DAY_START_SECONDS
      // Drive leg = arrival minus (previous arrival + previous on-site work),
      // floored at zero — waiting for a time window is not driving.
      const legMin =
        previousArrival === null
          ? 0
          : Math.max(0, Math.round((arrival - previousArrival - previousServiceSec) / 60))
      stops.push({
        jobId: job.id,
        title: job.title,
        client: job.client,
        isNew: job.techId !== tech.id,
        startBlock: Math.max(
          0,
          Math.min(
            TOTAL_BLOCKS - job.spanBlocks,
            Math.round((arrival / 60 - DAY_START_MINUTES) / 30)
          )
        ),
        spanBlocks: job.spanBlocks,
        travelFromPrevMin: stops.length === 0 ? 0 : Math.max(0, legMin)
      })
      placed.add(job.id)
      travelTotal += stops.length === 1 ? 0 : Math.max(0, legMin)
      previousArrival = arrival
      previousServiceSec = job.spanBlocks * 30 * 60
    }

    if (stops.length === 0) continue
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

  // Every same-day, incomplete, solvable job the solution failed to place
  // reports with a reason a dispatcher can act on.
  const solvable = buildVroomRequest(day, jobs, technicians, config).solvableJobIds
  for (const job of jobs) {
    if (placed.has(job.id)) continue
    if (jobDay(job) !== day || job.status === "complete" || !solvable.has(job.id)) continue
    unplaced.push({
      jobId: job.id,
      title: job.title,
      reason: "Fleet optimization could not place this stop within working windows"
    })
  }

  return {
    routes: routes.filter(r => r.stops.length > 0),
    unplaced
  }
}

/** Server engine call: board state → VROOM request → mapped OptimizeResult.
 *  Throws on provider failure so the UI can fall back to the local engine. */
export async function optimizeFleetViaServer(
  day: string,
  jobs: Job[],
  technicians: Technician[],
  config: OptimizeConfig
): Promise<OptimizeResult> {
  const { request } = buildVroomRequest(day, jobs, technicians, config)
  const { apiRequest } = await import("@/lib/api")
  const solution = await apiRequest<VroomSolution>("/api/routing/optimize", {
    method: "POST",
    body: JSON.stringify(request)
  })
  return mapVroomSolution(solution, day, jobs, technicians, config)
}

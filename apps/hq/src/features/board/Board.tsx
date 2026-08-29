"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core"
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  useQueryStates
} from "nuqs"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { DispatchGantt, DispatchList, DispatchTable } from "./DispatchViews"
import { CrewRouteJobTree } from "./CrewRouteJobTree"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FORCE_DEMO } from "@/lib/api"
import { fetchBoardPayload } from "@/lib/adapter"
import { todayIsoDay } from "@/lib/format"
import { rankCrews } from "@/lib/assignment"
import { cacheJobs } from "@/lib/offline"
import { primeRoadMatrix } from "@/lib/roadTime"
import { travelMinutes } from "@/lib/travel"
import { DEPOT } from "@/lib/optimize"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { AssignCheck } from "@/types"

import { FilterBar } from "./FilterBar"
import { DispatchHealthStrip } from "./DispatchHealthStrip"
import { SuggestionStrip } from "./SuggestionStrip"
import { RouteOptimizerCard } from "./RouteOptimizerCard"
import { QueueRail } from "@/features/left/QueueRail"
import { DispatchCanvas, type BestSlot } from "@/features/center/DispatchCanvas"
import { JobListView } from "@/features/center/JobListView"
import { CalendarView } from "@/features/calendar/CalendarView"
import { MapView } from "@/features/map/MapView"
import { JobDetailsDialog } from "@/features/right/JobDetailsDialog"
import { ClosedLoopHub } from "@/features/office/ClosedLoopHub"
import { QueueCardVisual } from "@/features/left/QueueCardVisual"
import { performAssignment } from "./actions"

interface DragState {
  jobId: string
  fromBlockDrag: boolean
  overTechId: string | null
  check: AssignCheck | null
}

/** Dispatch module — the researched topology: ONE toggleable canvas behind a
 *  zoom + filter toolbar, unassigned queue as a collapsible rail (Crew view),
 *  job details as a modal overlay, and the SAL-style suggestion strip ranking
 *  crews for the picked-up task with a best-slot beacon on the canvas. */
export function Board() {
  const jobs = useJobsList()
  // One ORS matrix call per session upgrades every travel figure on the
  // board (suggestions, bands, optimizer, conflicts) to real road times.
  // No-ops without NEXT_PUBLIC_ORS_API_KEY.
  useEffect(() => {
    void primeRoadMatrix([DEPOT, ...jobs.flatMap(j => (j.location ? [j.location] : []))])
  }, [jobs])
  const technicians = useBoardStore(s => s.technicians)
  const dataMode = useBoardStore(s => s.dataMode)
  const hydrateFromApi = useBoardStore(s => s.hydrateFromApi)
  const enterDemo = useBoardStore(s => s.enterDemo)
  const setPaletteOpen = useBoardStore(s => s.setPaletteOpen)
  const selectJob = useBoardStore(s => s.selectJob)
  const openDetails = useBoardStore(s => s.openDetails)
  const selectedJobId = useBoardStore(s => s.selectedJobId)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [queueOpen, setQueueOpen] = useState(true)

  const [filters, setFilters] = useQueryStates({
    view: parseAsString.withDefault("matrix"),
    zoom: parseAsString.withDefault("daily"),
    status: parseAsArrayOf(parseAsString).withDefault([]),
    priority: parseAsArrayOf(parseAsString).withDefault([]),
    skill: parseAsArrayOf(parseAsString).withDefault([]),
    region: parseAsArrayOf(parseAsString).withDefault([]),
    jobType: parseAsArrayOf(parseAsString).withDefault([]),
    team: parseAsArrayOf(parseAsString).withDefault([]),
    availableOnly: parseAsBoolean.withDefault(false),
    date: parseAsString.withDefault(todayIsoDay())
  })
  const splitMap = filters.view === "map" && filters.zoom === "daily"
  const presentation = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("presentation")
  const routeRiskCount = technicians.reduce((count, tech) => {
    const rowJobs = jobs.filter(job => job.techId === tech.id && job.location).sort((a, b) => a.startBlock - b.startBlock)
    return count + rowJobs.slice(1).reduce((rowCount, job, index) => {
      const previous = rowJobs[index]
      const gap = (job.startBlock - previous.startBlock - previous.spanBlocks) * 30
      return rowCount + (gap >= 0 && previous.location && job.location && travelMinutes(previous.location, job.location) > gap ? 1 : 0)
    }, 0)
  }, 0)

  const selectedJob = jobs.find(j => j.id === selectedJobId)
  const showSuggestions =
    filters.view === "matrix" && filters.zoom === "daily" && selectedJob?.status === "unassigned"

  const bestSlot: BestSlot | null = useMemo(() => {
    if (!showSuggestions || !selectedJob) return null
    const [best] = rankCrews(selectedJob, technicians, jobs)
    if (!best || !best.qualified) return null
    return { techId: best.tech.id, block: best.firstFreeBlock, spanBlocks: selectedJob.spanBlocks }
  }, [showSuggestions, selectedJob, technicians, jobs])

  // Global 1s heartbeat driving every running timer.
  useEffect(() => {
    const interval = setInterval(() => useBoardStore.getState().tick(), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setPaletteOpen])

  // Data hydration: live API first, seeded demo fallback (5s polling).
  const boardQuery = useQuery({
    queryKey: ["board"],
    queryFn: fetchBoardPayload,
    refetchInterval: 5_000,
    enabled: !FORCE_DEMO && dataMode !== "demo"
  })

  useEffect(() => {
    if (FORCE_DEMO) {
      enterDemo()
      void cacheJobs(Object.values(useBoardStore.getState().jobs))
      return
    }
    if (boardQuery.data && boardQuery.data.jobs.length > 0) {
      hydrateFromApi(boardQuery.data)
      void cacheJobs(Object.values(useBoardStore.getState().jobs))
    } else if (boardQuery.isError && dataMode === "connecting") {
      enterDemo()
    }
  }, [boardQuery.data, boardQuery.isError, dataMode, hydrateFromApi, enterDemo])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const activeJob = useMemo(
    () => (drag ? jobs.find(j => j.id === drag.jobId) ?? null : null),
    [drag, jobs]
  )
  const hoverInvalid = Boolean(drag?.overTechId && drag.check && !drag.check.ok)

  const parseDragId = (id: string): { jobId: string; fromBlock: boolean } =>
    id.startsWith("block:")
      ? { jobId: id.slice(6), fromBlock: true }
      : { jobId: id, fromBlock: false }

  const parseCellId = (id: string): { techId: string; block: number } | null => {
    if (!id.startsWith("cell:")) return null
    const [, techId, block] = id.split(":")
    return { techId, block: Number(block) }
  }

  const onDragStart = (event: DragStartEvent): void => {
    const { jobId, fromBlock } = parseDragId(String(event.active.id))
    // Picking a card up surfaces the ranked suggestions immediately
    // (research §AI Scheduling Suggestions on dragStart).
    const job = useBoardStore.getState().jobs[jobId]
    if (job?.status === "unassigned") selectJob(jobId)
    setDrag({ jobId, fromBlockDrag: fromBlock, overTechId: null, check: null })
  }

  const onDragOver = (event: DragOverEvent): void => {
    const cell = event.over?.id ? parseCellId(String(event.over.id)) : null
    if (!cell || !drag) return
    // Constraint validation fires DURING the interaction against the exact
    // hovered 30-minute slot (research §Phase 2).
    const check = useBoardStore.getState().canAssign(drag.jobId, cell.techId, cell.block)
    setDrag(prev => (prev ? { ...prev, overTechId: cell.techId, check } : prev))
  }

  /** Custom 2D collision strategy (research §Phase 2): the pointer's exact
   * cell wins when it is inside one; otherwise fall back to rect intersection
   * so edge-of-card drops still resolve. Plain rectIntersection alone lets an
   * adjacent row's narrow cells out-overlap the intended slot. */
  const collisionDetection: CollisionDetection = args => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return rectIntersection(args)
  }

  const onDragEnd = async (event: DragEndEvent): Promise<void> => {
    const cell = event.over?.id ? parseCellId(String(event.over.id)) : null
    const jobId = drag?.jobId
    setDrag(null)
    if (!cell || !jobId) return
    const ok = await performAssignment(jobId, cell.techId, cell.block)
    if (ok) selectJob(jobId)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <ClosedLoopHub />
        <FilterBar filters={filters} onFiltersChange={setFilters} zoom={filters.zoom} />
        <DispatchHealthStrip
          jobs={jobs}
          routeRiskCount={routeRiskCount}
          onFilter={signal => {
            if (signal === "active" || signal === "unassigned" || signal === "delayed") {
              void setFilters({ view: "list", status: [signal] })
            } else if (signal === null) {
              void setFilters({ status: [] })
            }
          }}
        />
        {showSuggestions && selectedJob && <SuggestionStrip job={selectedJob} />}
        {filters.view === "matrix" && <CrewRouteJobTree />}

        <div className="relative flex min-h-0 flex-1">
          {filters.view === "matrix" && (
            <>
              {queueOpen ? (
                <div className="flex w-56 min-w-0 shrink-0 flex-col border-r border-line bg-recess/30">
                  <div className="flex items-center justify-between px-3 pt-3">
                    <span className="label-mono text-2xs text-ink-low">UNASSIGNED QUEUE</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Collapse queue"
                      data-testid="queue-toggle"
                      onClick={() => setQueueOpen(false)}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </div>
                  <QueueRail date={filters.date} />
                </div>
              ) : (
                <div className="flex w-9 shrink-0 flex-col items-center border-r border-line bg-recess/30 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Expand queue"
                    data-testid="queue-toggle"
                    onClick={() => setQueueOpen(true)}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                  <span className="label-mono mt-2 text-2xs text-ink-low">Q</span>
                </div>
              )}
            </>
          )}

          <div className="min-w-0 flex-1">
            {filters.view === "list" && (presentation === "table" ? <DispatchTable filters={filters} /> : presentation === "gantt" ? <DispatchGantt filters={filters} /> : <DispatchList filters={filters} />)}
            {filters.view === "calendar" && <CalendarView filters={filters} />}
            {filters.view === "map" && (splitMap ? <div className="grid h-full min-h-0 grid-cols-[minmax(280px,0.85fr)_minmax(520px,1.5fr)] divide-x divide-line"><MapView filters={filters} /><DispatchCanvas filters={filters} zoom="daily" drag={drag} bestSlot={bestSlot} /></div> : <MapView filters={filters} />)}
            {filters.view === "matrix" && (
              <DispatchCanvas
                filters={filters}
                zoom={filters.zoom}
                drag={drag}
                bestSlot={bestSlot}
              />
            )}
          </div>

          <RouteOptimizerCard date={filters.date} />
        </div>

        <JobDetailsDialog />
        <DragOverlay dropAnimation={null}>
          {activeJob ? (
            <div
              className={cn(
                hoverInvalid && "cursor-not-allowed opacity-50",
                drag?.fromBlockDrag && "rotate-1"
              )}
            >
              <QueueCardVisual job={activeJob} floating />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}

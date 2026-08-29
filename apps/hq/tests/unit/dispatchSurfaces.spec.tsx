import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DispatchHealthStrip } from "@/features/board/DispatchHealthStrip"
import { DispatchTable } from "@/features/board/DispatchViews"
import { CrewRouteJobTree } from "@/features/board/CrewRouteJobTree"
import { jobs as seedJobs, technicians as seedTechs } from "@/data/seed"
import { useBoardStore } from "@/stores/boardStore"
import type { BoardFilters } from "@/features/board/filters"
import type { Job } from "@/types"

const filters: BoardFilters = {
  status: [],
  priority: [],
  skill: [],
  region: [],
  jobType: [],
  team: [],
  availableOnly: false,
  date: new Date().toISOString().slice(0, 10)
}

function seedStore(jobs: Job[]) {
  useBoardStore.setState({
    technicians: seedTechs,
    jobs: Object.fromEntries(jobs.map(job => [job.id, job])),
    selectedJobId: null,
    detailsOpen: false
  })
}

afterEach(() => {
  cleanup()
  useBoardStore.setState({ selectedJobId: null, detailsOpen: false })
})

describe("DispatchTable (Kibo table composition)", () => {
  it("renders the semantic status contract — an active emergency reads Emergency, never Active", () => {
    const target = seedJobs.find(job => job.priority !== "emergency")!
    const jobs = seedJobs.map(job =>
      job.id === target.id ? { ...job, status: "active" as const, priority: "emergency" as const } : job
    )
    seedStore(jobs)
    render(<DispatchTable filters={filters} />)

    const row = screen.getByRole("row", { name: `${target.title}, Emergency` })
    expect(row).toHaveTextContent("Emergency")
    expect(row).not.toHaveTextContent(">Active<")

    const normalActive = seedJobs.find(job => job.id !== target.id && job.status === "active")
    if (normalActive) {
      expect(screen.getByRole("row", { name: `${normalActive.title}, Active` })).toBeTruthy()
    }
  })

  it("keyboard model: Enter on a focused row opens the job inspector", () => {
    seedStore(seedJobs)
    render(<DispatchTable filters={filters} />)
    const row = screen.getAllByRole("row")[1] // first body row
    fireEvent.keyDown(row, { key: "Enter" })
    expect(useBoardStore.getState().detailsOpen).toBe(true)
    expect(useBoardStore.getState().selectedJobId).toBeTruthy()
  })

  it("shows the empty state when filters exclude everything", () => {
    seedStore(seedJobs)
    render(<DispatchTable filters={{ ...filters, status: ["delayed"] }} />)
    expect(screen.getByText("No jobs match these filters")).toBeTruthy()
  })
})

describe("DispatchHealthStrip", () => {
  it("counts the shift pulse and routes filter signals", async () => {
    const onFilter = vi.fn()
    const jobs = [
      { ...seedJobs[0], status: "active" },
      { ...seedJobs[1], status: "unassigned" },
      { ...seedJobs[2], status: "delayed" }
    ] as Job[]
    render(<DispatchHealthStrip jobs={jobs} routeRiskCount={2} onFilter={onFilter} />)

    const billing = screen.getByRole("button", { name: /Billing now: 1 active jobs/i })
    const dispatch = screen.getByRole("button", { name: /Needs dispatch: 1 unassigned/i })
    const atRisk = screen.getByRole("button", { name: /At risk: 1 delayed jobs/i })
    const gaps = screen.getByRole("button", { name: /Route gaps: 2 tight transitions/i })
    expect(billing).toBeTruthy()
    expect(dispatch).toBeTruthy()
    expect(atRisk).toBeTruthy()
    expect(gaps).toBeTruthy()

    fireEvent.click(dispatch)
    expect(onFilter).toHaveBeenCalledWith("unassigned")
    fireEvent.click(gaps)
    expect(onFilter).toHaveBeenCalledWith("route-risk")
  })
})

describe("CrewRouteJobTree", () => {
  it("expands a crew and its route, selects a job, and mirrors the selection to the map focus channel", async () => {
    seedStore(seedJobs)
    const focusSpy = vi.fn()
    window.addEventListener("hq-map-focus-job", focusSpy)
    render(<CrewRouteJobTree />)

    // Crew level, then the nested Route level — both must expand before the
    // job leaf buttons exist.
    fireEvent.click(screen.getAllByRole("button", { name: /· \d+ jobs/i })[0])
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /route ·/i }).length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByRole("button", { name: /route ·/i })[0])
    await waitFor(() => {
      expect(screen.getAllByTestId(/^tree-job-/).length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByTestId(/^tree-job-/)[0])

    const state = useBoardStore.getState()
    expect(state.detailsOpen).toBe(true)
    expect(state.selectedJobId).toBeTruthy()
    expect(focusSpy).toHaveBeenCalled()
    window.removeEventListener("hq-map-focus-job", focusSpy)
  })
})

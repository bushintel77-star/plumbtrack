"use client"

import { useEffect, useMemo, useState } from "react"
import { BriefcaseBusiness, Users } from "lucide-react"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { jobDay } from "@/lib/schedule"
import { Tree, TreeItem } from "@/components/ui/tree"

export function CrewRouteJobTree() {
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const jobs = useJobsList()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(previous => ({ ...previous, [id]: !previous[id] }))
  const selectJob = (jobId: string) => { openDetails(jobId); window.dispatchEvent(new CustomEvent("hq-map-focus-job", { detail: jobId })) }
  const routes = useMemo(() => technicians.map(tech => ({ tech, jobs: jobs.filter(job => job.techId === tech.id).sort((a, b) => a.startBlock - b.startBlock) })), [jobs, technicians])

  useEffect(() => {
    const onFocusJob = (event: Event) => {
      const jobId = (event as CustomEvent<string>).detail
      const job = jobs.find(item => item.id === jobId)
      if (!job?.techId) return
      setExpanded(previous => ({ ...previous, [job.techId!]: true, [`route-${job.techId}`]: true }))
      window.requestAnimationFrame(() => document.querySelector(`[data-testid="tree-job-${jobId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    }
    window.addEventListener("hq-dispatch-focus-job", onFocusJob)
    return () => window.removeEventListener("hq-dispatch-focus-job", onFocusJob)
  }, [jobs])

  useEffect(() => {
    if (!selectedJobId) return
    const job = jobs.find(item => item.id === selectedJobId)
    if (!job?.techId) return
    setExpanded(previous => ({ ...previous, [job.techId!]: true, [`route-${job.techId}`]: true }))
    window.requestAnimationFrame(() => document.querySelector(`[data-testid="tree-job-${selectedJobId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
  }, [jobs, selectedJobId])

  return <section className="panel m-3 max-w-sm p-2" aria-label="Crew route job navigator" data-testid="crew-route-job-tree">
    <div className="flex items-center gap-2 px-2 py-2"><Users className="h-4 w-4 text-chrome-400"/><div><h2 className="text-xs font-bold">Dispatch hierarchy</h2><p className="label-mono text-2xs text-ink-low">CREW · ROUTE · JOB</p></div></div>
    <Tree label="Crew route and job navigator">
      {routes.map(({ tech, jobs: techJobs }) => <TreeItem key={tech.id} label={`${tech.name} · ${techJobs.length} jobs`} expanded={expanded[tech.id]} onToggle={() => toggle(tech.id)}>
        <TreeItem label={`Route · ${jobDay(techJobs[0] ?? { scheduledDate: undefined } as never)}`} expanded={expanded[`route-${tech.id}`]} onToggle={() => toggle(`route-${tech.id}`)}>
          {techJobs.length === 0 ? <TreeItem label="No scheduled jobs" /> : techJobs.map(job => <div key={job.id} role="treeitem" aria-selected={selectedJobId === job.id}><button type="button" data-testid={`tree-job-${job.id}`} onClick={() => selectJob(job.id)} className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-fill ${selectedJobId === job.id ? "bg-chrome-wash text-ink" : ""}`}><BriefcaseBusiness className="h-3.5 w-3.5 text-ink-low"/><span className="truncate">{job.id.replace("j-", "Job #")} · {job.title}</span></button></div>)}
        </TreeItem>
      </TreeItem>)}
    </Tree>
  </section>
}

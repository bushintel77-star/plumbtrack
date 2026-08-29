"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BriefcaseBusiness, ChevronRight, Users } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";

export function CrewRouteJobTree() {
  const { jobs, members, channels, messages, activeChannelId, openJob, activeId } = usePlumbTrackCtx();
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staff = members.filter(member => member.role !== "bot");
  const activeChannel = channels.find(channel => channel.id === activeChannelId);
  const contextJobIds = new Set(messages.filter(message => message.channelId === activeChannelId).flatMap(message => Array.from(message.text.matchAll(/J-(\d+)/gi), match => `J-${match[1]}`)));
  const relevantJobs = jobs.filter(job => showAll || !activeChannel || contextJobIds.size === 0 || contextJobIds.has(job.id.toUpperCase()));

  useEffect(() => {
    if (!activeId) return;
    setExpanded(true);
    window.requestAnimationFrame(() => document.querySelector(`[data-testid="field-tree-job-${activeId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [activeId]);

  useEffect(() => { setShowAll(false); }, [activeChannelId]);

  return <section className="surface-card p-3" aria-label="Crew route and job navigator" data-testid="field-crew-route-job-tree">
    <button type="button" className="flex min-h-[44px] w-full items-center gap-2 text-left" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
      <Users size={17} aria-hidden="true" /><span className="flex-1 text-sm font-bold">Crew routes</span><button type="button" className="text-2xs font-bold text-accent" onClick={(event) => { event.stopPropagation(); setShowAll(value => !value); }}>{showAll ? "Context" : "All"}</button><ChevronRight size={17} className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
    </button>
    {expanded && <div ref={treeRef} role="tree" tabIndex={-1} aria-label="Field crew routes" onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('button[data-testid^="field-tree-job-"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); return; }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { const next = query + event.key.toLowerCase(); setQuery(next); if (queryTimer.current) clearTimeout(queryTimer.current); queryTimer.current = setTimeout(() => setQuery(""), 700); items.find(item => item.textContent?.toLowerCase().includes(next))?.focus(); }
    }} className="mt-1 space-y-1">{staff.map(member => {
      const assigned = relevantJobs.filter(job => job.timeEntries.some(entry => entry.staffId === member.id));
      return <div key={member.id} role="treeitem" aria-selected="false"><div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />{member.name}<span className="ml-auto text-xs text-ink-low">{assigned.length}</span></div>{assigned.slice(0, 3).map(job => <button key={job.id} type="button" data-testid={`field-tree-job-${job.id}`} onClick={() => openJob(job.id)} className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-4 text-left text-xs text-ink-low active:bg-fill ${activeId === job.id ? "bg-fill text-ink" : ""}`}><BriefcaseBusiness size={14} aria-hidden="true" /><span className="truncate">{job.id} · {job.client}</span></button>)}</div>;
    })}</div>}
  </section>;
}

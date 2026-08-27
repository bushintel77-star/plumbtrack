"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert, Wrench, CalendarClock } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { GlassCard } from "@/components/ui/GlassCard";
import { expiryState } from "@/lib/documents";
import { formatSerial, localDateStr } from "@/lib/display";
import type { Job } from "@/types";

type Scope = "today" | "week" | "all";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/** Overlapping seconds of every time entry inside [fromMs, toMs). Open
 *  entries count their elapsed time to now when includeOpen is set. */
function secsRange(jobs: Job[], fromMs: number | null, toMs: number | null, includeOpen = false): number {
  let sec = 0;
  for (const j of jobs)
    for (const e of j.timeEntries) {
      const s = new Date(e.start).getTime();
      if (!e.end) {
        if (!includeOpen) continue;
        const from = Math.max(s, fromMs ?? s);
        const to = Math.min(Date.now(), toMs ?? Date.now());
        if (to > from) sec += (to - from) / 1000;
        continue;
      }
      const en = new Date(e.end).getTime();
      const from = Math.max(s, fromMs ?? s);
      const to = Math.min(en, toMs ?? en);
      if (to > from) sec += (to - from) / 1000;
    }
  return sec;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function ProjectDashboard() {
  const { jobs, quotes, openJob, staffMembers, setActiveTab, setActiveId, setView, documents } = usePlumbTrackCtx();
  const [scope, setScope] = useState<Scope>("today");

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== "completed"), [jobs]);
  const today = localDateStr();

  const onSiteIds = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) for (const e of j.timeEntries) if (e.end === null) set.add(e.staffId);
    return set;
  }, [jobs]);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const hoursToday = secsRange(jobs, startOfToday, null, true) / 3600;
  const hoursWeek = secsRange(jobs, Date.now() - 7 * DAY_MS, null, true) / 3600;
  const hoursAll = secsRange(jobs, null, null, true) / 3600;
  const hoursPrevWeek = secsRange(jobs, Date.now() - 14 * DAY_MS, Date.now() - 7 * DAY_MS) / 3600;
  const deltaPct = hoursPrevWeek > 0.1 ? Math.round(((hoursWeek - hoursPrevWeek) / hoursPrevWeek) * 100) : null;

  // Hours per day for the trailing week — today renders as the hot bar.
  const weekBars = useMemo(() => {
    const bars: number[] = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = startOfToday - d * DAY_MS;
      bars.push(secsRange(jobs, dayStart, dayStart + DAY_MS, true) / 3600);
    }
    return bars;
  }, [jobs, startOfToday]);
  const barMax = Math.max(...weekBars, 0.1);

  const reportsSubmitted = activeJobs.filter((j) => j.dailyReports.some((r) => r.date === today && r.submittedAt)).length;
  const reportsDueJobs = activeJobs.filter((j) => !j.dailyReports.some((r) => r.date === today && r.submittedAt));
  const reportPct = activeJobs.length > 0 ? reportsSubmitted / activeJobs.length : 1;

  const openQuotes = useMemo(() => quotes.filter((q) => q.status === "sent" || q.status === "draft"), [quotes]);
  const quotesPotential = openQuotes.reduce((sum, q) => sum + q.lines.reduce((s, l) => s + l.qty * l.rate, 0), 0);

  const expired = documents.filter((d) => expiryState(d.expiresOn) === "expired");
  const soon = documents.filter((d) => expiryState(d.expiresOn) === "soon");
  const atRiskDocs = [...expired, ...soon];

  const liveJobs = activeJobs.filter((j) => j.timeEntries.some((e) => e.end === null));
  const scheduledJobs = activeJobs.filter((j) => !j.timeEntries.some((e) => e.end === null));
  const doneToday = jobs.filter(
    (j) => j.status === "completed" && j.timeEntries.some((e) => new Date(e.start).getTime() >= startOfToday),
  );

  const hours = scope === "today" ? hoursToday : scope === "week" ? hoursWeek : hoursAll;
  const hoursLabel = scope === "today" ? "h today" : scope === "week" ? "h this week" : "h all time";
  const RING_C = 2 * Math.PI * 26;

  return (
    <div className="home-gradient p-3 space-y-2.5">
      {/* Scope segmented control */}
      <div className="flex bg-fill border border-line rounded-xl p-0.5 gap-0.5" role="tablist" aria-label="Dashboard scope">
        {([["today", "Today"], ["week", "This week"], ["all", "All"]] as [Scope, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={scope === key}
            onClick={() => setScope(key)}
            className={`flex-1 min-h-[36px] rounded-[10px] text-[11px] font-black uppercase tracking-wider transition haptic ${
              scope === key ? "text-accent" : "text-ink-low"
            }`}
            style={scope === key ? { background: "var(--app-surface-solid)", boxShadow: "0 2px 8px -2px rgba(0,0,0,0.35)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bento KPI grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Hours — big number, honest delta, trailing-week micro chart */}
        <GlassCard className="col-span-2 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-ink-low">
              Hours {scope === "today" ? "today" : scope === "week" ? "this week" : "all time"}
            </span>
            {scope === "week" && deltaPct !== null && (
              <span
                className={`text-[10px] font-black rounded-full px-1.5 py-0.5 ${
                  deltaPct >= 0 ? "text-complete bg-complete-dim" : "text-urgent bg-urgent-dim"
                }`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
              </span>
            )}
          </div>
          <div className="text-2xl font-black tracking-tight text-ink tabular-nums">
            {hours < 10 ? hours.toFixed(1) : Math.round(hours)}
            <span className="text-xs font-bold text-ink-low ml-1">{hoursLabel}</span>
          </div>
          <div className="flex items-end gap-1 h-9 mt-2.5" aria-hidden="true">
            {weekBars.map((h, i) => (
              <span
                key={i}
                className={`flex-1 rounded-t-[3px] min-h-[3px] ${i === weekBars.length - 1 ? "bg-accent" : "bg-fill-strong"}`}
                style={{ height: `${Math.max(6, (h / barMax) * 100)}%` }}
              />
            ))}
          </div>
        </GlassCard>

        {/* Daily reports — progress ring */}
        <GlassCard
          interactive
          className="col-span-2 p-3.5"
          onClick={() => {
            const target = reportsDueJobs[0] ?? activeJobs[0];
            if (!target) return;
            setActiveId(target.id);
            setView("dailyReport");
          }}
          ariaLabel="Open the daily report for the first active job"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-ink-low">Daily reports</span>
            <CheckCircle2 size={13} className={reportsDueJobs.length === 0 ? "text-complete" : "text-pending"} />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-black tracking-tight text-ink tabular-nums">
              {reportsSubmitted}
              <span className="text-xs font-bold text-ink-low">/{activeJobs.length}</span>
            </div>
            <div className="relative w-[54px] h-[54px] ml-auto text-accent">
              <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
                <circle cx="27" cy="27" r="23" fill="none" stroke="var(--surface-border)" strokeWidth="6" />
                <circle
                  cx="27"
                  cy="27"
                  r="23"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - reportPct)}
                  style={{ transition: "stroke-dashoffset 400ms ease" }}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-[11px] font-black text-ink tabular-nums">
                {Math.round(reportPct * 100)}%
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Crew — presence-aware avatar stack */}
        <GlassCard className="col-span-2 p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-ink-low">Crew</span>
            <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 text-complete bg-complete-dim">
              {onSiteIds.size} on
            </span>
          </div>
          <div className="flex">
            {staffMembers.slice(0, 5).map((m) => {
              const on = onSiteIds.has(m.id);
              return (
                <span
                  key={m.id}
                  className="relative w-8 h-8 rounded-full grid place-items-center text-[11px] font-black text-white -ml-2 first:ml-0 border-2"
                  style={{ backgroundColor: on ? m.color : "var(--bg-fallback-member)", borderColor: "var(--app-surface-solid)" }}
                  title={`${m.name}${on ? " — on site" : ""}`}
                >
                  {initials(m.name)}
                  {on && (
                    <span
                      className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-complete"
                      style={{ boxShadow: "0 0 0 2px var(--app-surface-solid)" }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </GlassCard>

        {/* Quotes — open count + honest pipeline value */}
        <GlassCard interactive className="col-span-2 p-3.5" onClick={() => setActiveTab("quotes")} ariaLabel="Open quotes">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-ink-low">Quotes pending</span>
            <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 text-pending bg-pending-dim">{openQuotes.length} open</span>
          </div>
          <div className="text-2xl font-black tracking-tight text-ink tabular-nums">
            {quotesPotential > 0 ? `$${Math.round(quotesPotential).toLocaleString()}` : "—"}
          </div>
          <div className="text-[10.5px] text-ink-low mt-1">
            {quotesPotential > 0 ? "potential across open quotes" : "awaiting line items on open quotes"}
          </div>
        </GlassCard>
      </div>

      {/* Job health */}
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-low">Job health</span>
        <button type="button" onClick={() => setActiveTab("jobs")} className="text-[11.5px] font-bold text-accent">
          All jobs ›
        </button>
      </div>
      {liveJobs.length + scheduledJobs.length + doneToday.length === 0 && (
        <GlassCard className="p-5 text-center">
          <Wrench size={20} className="text-ink-low mx-auto mb-2" />
          <p className="text-sm font-bold text-ink">No active jobs</p>
          <p className="text-[11px] text-ink-low mt-1">A quiet day — new jobs appear here the moment they're scheduled.</p>
        </GlassCard>
      )}
      <div className="space-y-1.5">
        {liveJobs.map((j) => (
          <GlassCard key={j.id} interactive onClick={() => openJob(j.id)} className="p-3" ariaLabel={`Job ${j.id} — ${j.client} (on site)`}>
            <div className="flex items-center gap-3">
              <Wrench size={16} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-ink truncate">{j.client}</span>
                <span className="block text-[10.5px] text-ink-low truncate">
                  On site now · {j.timeEntries.filter((e) => e.end === null).length} on job
                </span>
              </div>
              <span className="text-[10px] font-black uppercase rounded-full px-2 py-1 text-accent bg-accent-dim">Live</span>
            </div>
          </GlassCard>
        ))}
        {scheduledJobs.map((j) => (
          <GlassCard key={j.id} interactive onClick={() => openJob(j.id)} className="p-3" ariaLabel={`Job ${j.id} — ${j.client} (scheduled)`}>
            <div className="flex items-center gap-3">
              <CalendarClock size={16} className="text-ink-low shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-ink truncate">{j.client}</span>
                <span className="block text-[10.5px] text-ink-low truncate">{j.scope}</span>
              </div>
              <span className="text-[10px] font-black uppercase rounded-full px-2 py-1 text-ink-low bg-fill border border-line">Sched</span>
            </div>
          </GlassCard>
        ))}
        {doneToday.slice(0, 2).map((j) => (
          <GlassCard key={j.id} interactive onClick={() => openJob(j.id)} className="p-3" ariaLabel={`Job ${j.id} — ${j.client} (completed today)`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-complete shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-ink truncate">{j.client}</span>
                <span className="block text-[10.5px] text-ink-low truncate">Completed today</span>
              </div>
              <span className="text-[10px] font-black uppercase rounded-full px-2 py-1 text-complete bg-complete-dim">Done</span>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Compliance watch */}
      {atRiskDocs.length > 0 && (
        <GlassCard interactive onClick={() => setActiveTab("documents")} ariaLabel="Open the document vault — compliance documents need attention">
          <div className="flex items-center gap-3">
            <ShieldAlert size={16} className="text-pending shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="block text-[13px] font-bold text-ink">
                {expired.length > 0 ? `${expired.length} expired` : `${soon.length} expiring`}
              </span>
              <span className="block text-[10.5px] text-ink-low truncate">
                {atRiskDocs.slice(0, 3).map((d) => `${d.name}${d.jobId ? ` (${formatSerial(d.jobId)})` : ""}`).join(" · ")}
              </span>
            </div>
            <span className="text-[12px] font-black text-pending shrink-0">
              {expired.length > 0
                ? "action"
                : `${Math.min(...soon.map((d) => Math.ceil((new Date(d.expiresOn!).getTime() - Date.now()) / DAY_MS)))}d`}
            </span>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

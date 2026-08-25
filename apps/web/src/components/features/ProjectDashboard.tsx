"use client";

import { useMemo, useState } from "react";
import { Clock, Users, FileText, AlertCircle, CheckCircle2, TrendingUp, ClipboardList, Shield } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { GlassCard } from "@/components/ui/GlassCard";
import { derivedJobStatus, formatDuration } from "@/lib/billing";
import type { Job } from "@/types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectDashboard() {
  const { jobs, quotes, openJob, members, setActiveTab, setActiveId, setView } = usePlumbTrackCtx();
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== "completed"), [jobs]);
  const today = todayStr();

  // Stats
  const crewClockedIn = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs)
      for (const e of j.timeEntries)
        if (e.end === null) set.add(e.staffId);
    return set.size;
  }, [jobs]);

  const reportsDueJobs = useMemo(
    () => activeJobs.filter((j) => !j.dailyReports.some((r) => r.date === today && r.submittedAt)),
    [activeJobs, today],
  );
  const reportsDue = reportsDueJobs.length;

  const totalHoursWeek = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let sec = 0;
    for (const j of jobs)
      for (const e of j.timeEntries)
        if (e.start >= weekAgo && e.end) sec += (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000;
    return sec;
  }, [jobs]);

  const openQuotes = useMemo(() => quotes.filter((q) => q.status === "sent" || q.status === "draft"), [quotes]);

  const jobHealth = (j: Job) => {
    let score = 0;
    let issues: string[] = [];
    if (j.dailyReports.some((r) => r.date === today && r.submittedAt)) score++;
    else issues.push("No daily report today");
    if (j.photos.length > 0) score++;
    if (j.timeEntries.some((e) => e.end === null)) score++;
    if (j.checklists.some((c) => c.completedAt)) score++;
    return { score, issues, color: score >= 3 ? "green" : score >= 2 ? "amber" : "red" };
  };

  return (
    <div className="p-3 space-y-2">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <GlassCard className="text-center p-3">
          <Users size={16} className="text-accent mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{crewClockedIn}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">On site</p>
        </GlassCard>
        <GlassCard className="text-center p-3">
          <FileText size={16} className="text-accent mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{activeJobs.length}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Active jobs</p>
        </GlassCard>
        <GlassCard className="text-center p-3">
          <Clock size={16} className="text-accent mx-auto mb-1" />
          <p className="text-sm font-bold text-white font-mono">{formatDuration(Math.floor(totalHoursWeek))}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Hours this wk</p>
        </GlassCard>
      </div>

      {/* Compliance */}
      <GlassCard
        interactive
        onClick={() => {
          const target = reportsDueJobs[0] ?? activeJobs[0];
          if (!target) return;
          setActiveId(target.id);
          setView("dailyReport");
        }}
        ariaLabel="Open the daily report for the first active job"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 size={13} /> Daily Reports
          </p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            reportsDue === 0 ? "bg-accent/15 text-accent" : "bg-red-500/15 text-red-400"
          }`}>
            {reportsDue === 0 ? "All submitted" : `${reportsDue} due`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((activeJobs.length - reportsDue) / Math.max(1, activeJobs.length)) * 100}%` }}
          />
        </div>
      </GlassCard>

      {/* Active jobs health */}
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-1 pt-1">Active Jobs</p>
      {activeJobs.map((j) => {
        const h = jobHealth(j);
        return (
          <GlassCard
            key={j.id}
            interactive
            onClick={() => openJob(j.id)}
            ariaLabel={`Job ${j.id} — ${j.client}`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{j.client}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{j.scope}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Health dot */}
                <span className={`w-2.5 h-2.5 rounded-full ${
                  h.color === "green" ? "bg-accent" : h.color === "amber" ? "bg-amber-400" : "bg-red-400"
                }`} />
                {/* Crew indicator */}
                {j.timeEntries.some((e) => e.end === null) && (
                  <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                    {j.timeEntries.filter((e) => e.end === null).length} on site
                  </span>
                )}
              </div>
            </div>
          </GlassCard>
        );
      })}

      {/* Open quotes */}
      {openQuotes.length > 0 && (
        <>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-1 pt-1">Pending Quotes</p>
          {openQuotes.map((q) => (
            <GlassCard key={q.id} interactive onClick={() => setActiveTab("quotes")} ariaLabel={`Quote ${q.id} — ${q.client}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{q.client}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{q.description}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-400">
                  {q.status}
                </span>
              </div>
            </GlassCard>
          ))}
        </>
      )}
    </div>
  );
}
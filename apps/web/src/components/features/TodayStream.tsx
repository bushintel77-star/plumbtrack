"use client";

import { useMemo, useState } from "react";

import type { Job } from "@/types";
import { derivedJobStatus } from "@/lib/billing";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { SwipeableCard } from "@/components/ui/SwipeableCard";
import { ShiftCard } from "@/components/shift/ShiftCard";
import {
  IconCameraField,
  IconHexNut,
  IconKeyAccess,
  IconNotePen,
} from "@/components/icons/FieldIcons";
import { Clock } from "lucide-react";

/**
 * The Day Stream — one chronological answer to "what's happening, what's
 * next" instead of a shift banner + search + filters + flat list. Jobs
 * promote themselves between NOW / NEXT / DONE as the day progresses.
 */
export function TodayStream() {
  const { jobs, openJob, currentStaffId, startClockOn } = usePlumbTrackCtx();
  const { activeShift } = usePlumbTrackCtx();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in_progress" | "scheduled" | "completed">("all");
  const [doneOpen, setDoneOpen] = useState(false);

  const counts = useMemo(() => {
    let scheduled = 0, inProgress = 0, completed = 0;
    for (const j of jobs) {
      const s = derivedJobStatus(j);
      if (s === "scheduled") scheduled++;
      else if (s === "in_progress") inProgress++;
      else completed++;
    }
    return { all: jobs.length, scheduled, inProgress, completed };
  }, [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const status = derivedJobStatus(j);
      if (filter !== "all" && status !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        j.client.toLowerCase().includes(q) ||
        j.address.toLowerCase().includes(q) ||
        j.scope.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q)
      );
    });
  }, [jobs, search, filter]);

  const now = filtered.filter((j) => derivedJobStatus(j) === "in_progress");
  const next = filtered
    .filter((j) => derivedJobStatus(j) === "scheduled")
    .sort((a, b) => Number(b.jobType === "emergency") - Number(a.jobType === "emergency"));
  const done = filtered.filter((j) => derivedJobStatus(j) === "completed");

  return (
    <div className="p-3 space-y-2">
      <ShiftCard />

      {activeShift && now.length + next.length > 0 && (
        <DayBrief jobs={jobs} nowCount={now.length} nextJob={next[0] ?? now[0]} />
      )}

      {/* Search & filters are office reflexes — collapsed by default */}
      <button
        type="button"
        onClick={() => setSearchOpen((open) => !open)}
        className="w-full min-h-[40px] rounded-xl bg-white/[0.03] border border-white/[0.07] text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-center gap-2"
      >
        Search &amp; filters {searchOpen ? "– hide" : `· ${counts.all} jobs`}
      </button>
      {searchOpen && (
        <div className="space-y-2 animate-fade-in">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs by client, address, or scope…"
            className="app-input w-full rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-600 focus:outline-none focus:border-accent/50 transition"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([
              { key: "all", label: `All (${counts.all})` },
              { key: "in_progress", label: `Active (${counts.inProgress})` },
              { key: "scheduled", label: `Scheduled (${counts.scheduled})` },
              { key: "completed", label: `Done (${counts.completed})` },
            ] as const).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${
                  filter === f.key
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-white/[0.04] text-slate-500 border border-white/[0.06]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {now.length + next.length + done.length === 0 && (
        <GlassCard>
          <p className="text-slate-500 text-sm text-center py-6">
            {search ? "No jobs match your search." : "No jobs on the board today."}
          </p>
        </GlassCard>
      )}

      {now.length > 0 && (
        <StreamSection label="Now" count={now.length}>
          {now.map((job) => (
            <JobEnvelope key={job.id} job={job} onOpen={openJob} onClockIn={(id) => startClockOn(id, currentStaffId)} />
          ))}
        </StreamSection>
      )}

      {next.length > 0 && (
        <StreamSection label="Next" count={next.length}>
          {next.map((job) => (
            <JobEnvelope key={job.id} job={job} onOpen={openJob} onClockIn={(id) => startClockOn(id, currentStaffId)} />
          ))}
        </StreamSection>
      )}

      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setDoneOpen((open) => !open)}
            className="w-full min-h-[44px] rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs font-bold text-slate-400 flex items-center justify-center gap-2"
          >
            <StatusChip status="completed" size={11} /> {done.length} done today {doneOpen ? "– hide" : "+ show"}
          </button>
          {doneOpen && (
            <div className="mt-2 space-y-2 animate-fade-in">
              {done.map((job) => (
                <JobEnvelope key={job.id} job={job} onOpen={openJob} onClockIn={() => undefined} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DayBrief({ jobs, nowCount, nextJob }: { jobs: Job[]; nowCount: number; nextJob?: Job }) {
  const seconds = useTimer(true, Date.now());
  const partsMissing = jobs.some(
    (j) => derivedJobStatus(j) !== "completed" && (j.serviceItems?.length ?? 0) === 0,
  );
  return (
    <div
      className="rounded-2xl p-3.5 border"
      style={{ background: "rgba(232,135,30,0.07)", borderColor: "rgba(232,135,30,0.2)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent mb-1.5">Day brief</p>
      <p className="text-[13px] text-slate-200 leading-snug">
        {nowCount > 0 ? `${nowCount} job${nowCount === 1 ? "" : "s"} running` : "Nothing running yet"}
        {nextJob ? ` — next stop ${nextJob.client.split(" ")[0]} at ${nextJob.address.split(",")[0]}` : ""}.
        {partsMissing && " Load likely parts before you roll."}
      </p>
      <p className="text-[10px] text-slate-500 mt-1.5 font-mono tabular-nums">
        on shift · {String(Math.floor(seconds / 3600)).padStart(2, "0")}:{String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}
      </p>
    </div>
  );
}

function StreamSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 px-1 flex items-center gap-2">
        {label}
        <span className="font-mono text-slate-600">{count}</span>
      </p>
      {children}
    </div>
  );
}

/** First-time-fix envelope — access, contact, parts and evidence at a glance. */
function JobEnvelope({
  job,
  onOpen,
  onClockIn,
}: {
  job: Job;
  onOpen: (id: string) => void;
  onClockIn: (id: string) => void;
}) {
  const status = derivedJobStatus(job);
  const parts = job.serviceItems?.length ?? 0;
  const notes = (job.voiceNotes?.length ?? 0) + job.logEntries.length;

  return (
    <SwipeableCard
      rightAction={
        status === "scheduled"
          ? { label: "Clock In", icon: Clock, color: "rgba(232, 135, 30, 0.85)", onTrigger: () => onClockIn(job.id) }
          : undefined
      }
      leftAction={{ label: "Open", icon: Clock, color: "rgba(51, 65, 85, 0.85)", onTrigger: () => onOpen(job.id) }}
      onActivate={() => onOpen(job.id)}
      ariaLabel={`Open job ${job.id} for ${job.client}`}
      className="animate-enter"
    >
      <div className="surface-card surface-card--interactive w-full text-left p-3.5">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wide text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-md px-1.5 py-0.5">
              {job.id}
            </span>
            {job.jobType === "emergency" && status !== "completed" && <StatusChip status="emergency" size={11} />}
          </div>
          <StatusChip status={status} />
        </div>
        <p className="font-semibold text-white text-[15px] tracking-tight mb-0.5">{job.client}</p>
        <p className="text-xs text-slate-400 mb-2">{job.address}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {job.accessCode && (
            <span className="inline-flex items-center gap-1 min-h-[26px] rounded-full px-2 text-[10.5px] font-semibold text-slate-300 bg-white/[0.05] border border-white/[0.09]">
              <IconKeyAccess size={12} className="text-accent" />
              {job.accessCode}
            </span>
          )}
          {job.phone && (
            <a
              href={`tel:${job.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center min-h-[26px] rounded-full px-2.5 text-[10.5px] font-bold text-accent bg-accent/10 border border-accent/25"
            >
              Call
            </a>
          )}
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 ml-auto font-mono">
            <IconHexNut size={12} /> {parts}
            <IconCameraField size={12} className="ml-1.5" /> {job.photos.length}
            <IconNotePen size={12} className="ml-1.5" /> {notes}
          </span>
        </div>
      </div>
    </SwipeableCard>
  );
}

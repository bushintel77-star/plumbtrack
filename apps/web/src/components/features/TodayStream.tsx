"use client";

import { useMemo, useState } from "react";

import type { Job } from "@/types";
import { derivedJobStatus } from "@/lib/billing";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { StatusChip } from "@/components/ui/StatusChip";
import { SwipeableCard } from "@/components/ui/SwipeableCard";
import { ShiftCard } from "@/components/shift/ShiftCard";
import {
  IconCameraField,
  IconHexNut,
  IconKeyAccess,
  IconNotePen,
} from "@/components/icons/FieldIcons";
import { Clock, MapPin, Phone } from "lucide-react";
import { formatSerial, formatSerialWithHash } from "@/lib/display";

/**
 * TodayStream — Hardware Chassis Design
 * From reference: widget-chassis containers, timeline for jobs, machined buttons
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
  // Prefer the job currently clocked on by this operator as the dashboard
  // focal point. If seeded/demo data has no open entry, keep the first active
  // job as a stable visual anchor rather than arming every in-progress card.
  const primaryActiveJobId = jobs.find((j) => j.timeEntries.some((entry) => entry.staffId === currentStaffId && entry.end === null))?.id
    ?? now[0]?.id;
  const next = filtered
    .filter((j) => derivedJobStatus(j) === "scheduled")
    .sort((a, b) => Number(b.jobType === "emergency") - Number(a.jobType === "emergency"));
  const done = filtered.filter((j) => derivedJobStatus(j) === "completed");

  return (
    <div className="mobile-page-shell" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
      {/* Shift Card */}
      <ShiftCard />

      {/* Day Brief */}
      {activeShift && now.length + next.length > 0 && (
        <DayBrief nowCount={now.length} nextJob={next[0] ?? now[0]} />
      )}

      {/* Search & Filters */}
      <div className="rounded-xl border border-line bg-fill px-4 py-3">
        <button
          type="button"
          onClick={() => setSearchOpen((open) => !open)}
          className="w-full text-left flex items-center gap-2"
        >
          <span className="text-ink-low text-xs">{searchOpen ? "▼" : "▶"}</span>
          <span className="label-micro">
            {counts.all} JOBS
          </span>
        </button>

        {searchOpen && (
          <div style={{ marginTop: "16px" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH..."
              aria-label="Search jobs"
              className="w-full px-3 py-2.5 text-[13px] font-mono"
              style={{
                background: "var(--app-inset)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
                borderRadius: "8px"
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {([
                { key: "all", label: "ALL", count: counts.all },
                { key: "in_progress", label: "ACTIVE", count: counts.inProgress },
                { key: "scheduled", label: "NEXT", count: counts.scheduled },
                { key: "completed", label: "DONE", count: counts.completed },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="btn-machined"
                  style={{
                    flex: 1,
                    height: "40px",
                    fontSize: "0.7rem",
                    background: filter === f.key ? "var(--chrome-600)" : "var(--btn-secondary-bg)",
                    border: filter === f.key ? "1px solid var(--chrome-400)" : "var(--chassis-border)",
                    boxShadow: filter === f.key ? "var(--btn-primary-shadow)" : "var(--btn-secondary-shadow)"
                  }}
                >
                  {f.label} {f.count}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {now.length + next.length + done.length === 0 && (
        <div className="widget-chassis">
          <div className="label-micro" style={{ textAlign: "center", padding: "24px 0" }}>
            {search ? "NO RESULTS" : "NO JOBS"}
          </div>
        </div>
      )}

      {/* NOW */}
      {now.length > 0 && (
        <JobSection label="NOW" count={now.length}>
          {now.map((job) => (
            <JobRow key={job.id} job={job} isPrimaryActive={job.id === primaryActiveJobId} onOpen={openJob} onClockIn={(id) => startClockOn(id, currentStaffId)} />
          ))}
        </JobSection>
      )}

      {/* NEXT */}
      {next.length > 0 && (
        <JobSection label="NEXT" count={next.length}>
          {next.map((job) => (
            <JobRow key={job.id} job={job} isPrimaryActive={job.id === primaryActiveJobId} onOpen={openJob} onClockIn={(id) => startClockOn(id, currentStaffId)} />
          ))}
        </JobSection>
      )}

      {/* DONE */}
      {done.length > 0 && (
        <div className="widget-chassis">
          <button
            type="button"
            onClick={() => setDoneOpen((open) => !open)}
            className="w-full text-left"
          >
            <div className="label-micro">
              {done.length} COMPLETED {doneOpen ? "▼" : "▶"}
            </div>
          </button>
          {doneOpen && (
            <div style={{ marginTop: "16px" }}>
              {done.map((job) => (
                <JobRow key={job.id} job={job} isPrimaryActive={false} onOpen={openJob} onClockIn={() => undefined} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );  }

/**
 * Day Brief — Hardware chassis with telemetry
 */
function DayBrief({ nowCount, nextJob }: { nowCount: number; nextJob?: Job }) {
  const { activeShift } = usePlumbTrackCtx();
  const anchor = activeShift?.loggedOnAt ? new Date(activeShift.loggedOnAt).getTime() : Date.now();
  const seconds = useTimer(true, anchor);

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  return (
    <div className="widget-chassis">
      <header className="widget-header" style={{ marginBottom: "16px" }}>
        <span className="label-micro">Day Brief</span>
      </header>
      <hr className="hairline-divider" />

      <div className="telemetry-grid" style={{ marginBottom: "0" }}>
        <div className="telemetry-data">
          <div className="data-block">
            <span className="label-micro">On Shift</span>
            <div className="data-hero">
              {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}
            </div>
          </div>
        </div>
        <div className="data-block" style={{ textAlign: "right" }}>
          <span className="label-micro">Active Jobs</span>
          <div className="data-hero" style={{ fontSize: "1.5rem" }}>
            {nowCount}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Job Section — with label
 */
function JobSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-micro jobs-section-label" style={{ marginBottom: "12px" }}>
        {label} · {count}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Job Row — Hardware chassis with timeline node
 */
function JobRow({
  job,
  isPrimaryActive,
  onOpen,
  onClockIn,
}: {
  job: Job;
  isPrimaryActive: boolean;
  onOpen: (id: string) => void;
  onClockIn: (id: string) => void;
}) {
  const status = derivedJobStatus(job);
  const parts = job.serviceItems?.length ?? 0;
  const notes = (job.voiceNotes?.length ?? 0) + (job.logEntries?.length ?? 0);

  // Timeline node status
  const nodeClass = status === "in_progress"
    ? isPrimaryActive ? "active" : "pending"
    : status === "completed"
    ? "complete"
    : "";

  return (
    <SwipeableCard
      rightAction={
        status === "scheduled"
          ? { label: "CLOCK IN", icon: Clock, color: "var(--chrome-600)", onTrigger: () => onClockIn(job.id) }
          : undefined
      }
      leftAction={{ label: "OPEN", icon: Clock, color: "var(--divider-etch)", onTrigger: () => onOpen(job.id) }}
      onActivate={() => onOpen(job.id)}
      ariaLabel={`Open job ${formatSerial(job.id)}`}
    >
      <div className={`widget-chassis job-card-chassis${status === "in_progress" && isPrimaryActive ? " is-active" : ""}`} style={{ padding: "16px" }}>
        {/* Header — Job ID + Status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span className="job-serial-readout">
            <span className="work-order-id">{formatSerialWithHash(job.id)}</span>
            {status === "in_progress" && isPrimaryActive && <span className="active-job-led" aria-label="Active job" title="Active job" />}
          </span>
          <div className="status-indicator">
            <span className={`status-dot ${nodeClass || ""}`} />
            <span className="label-micro">
              {status === "in_progress" ? (isPrimaryActive ? "ACTIVE" : "IN PROGRESS") : status === "scheduled" ? "SCHED" : "DONE"}
            </span>
          </div>
        </div>

        <hr className="hairline-divider" style={{ margin: "0 0 12px 0" }} />

        {/* Client name — title */}
        <div className="text-title">{job.client}</div>

        {/* Address */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
          <MapPin size={12} style={{ color: "var(--text-secondary)" }} />
          <span className="task-detail">{job.address}</span>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
          {job.accessCode && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              <IconKeyAccess size={12} style={{ color: "var(--chrome-400)" }} />
              {job.accessCode}
            </span>
          )}
          {job.phone && (
            <a
              href={`tel:${job.phone}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.75rem",
                color: "var(--chrome-400)",
                fontWeight: 700
              }}
            >
              <Phone size={11} />
              CALL
            </a>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <IconHexNut size={10} /> {parts}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <IconCameraField size={10} /> {job.photos?.length ?? 0}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <IconNotePen size={10} /> {notes}
            </span>
          </div>
        </div>
      </div>
    </SwipeableCard>
  );
}

"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Clock, Users, FileText, CheckCircle2, ShieldAlert } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { derivedJobStatus, formatDuration } from "@/lib/billing";
import { expiryState } from "@/lib/documents";
import type { Job } from "@/types";
import { formatSerial } from "@/lib/display";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Animated counter — rolls up from 0 to target.
 */
function useCounter(target: number): number {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);
  const startRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    startRef.current = Date.now();
    const from = current;

    const tick = () => {
      const elapsed = Date.now() - (startRef.current ?? 0);
      const progress = Math.min(elapsed / 600, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target]);

  return current;
}

/**
 * Stat tile — Hardware chassis with data-hero number
 */
function StatTile({
  value,
  label,
  unit,
}: {
  value: number;
  label: string;
  unit?: string;
}) {
  const display = useCounter(value);

  return (
    <div className="data-block" style={{ textAlign: "center" }}>
      <span className="label-micro">{label}</span>
      <div className="data-hero" style={{ fontSize: "2rem" }}>
        {display}
        {unit && <span className="data-unit">{unit}</span>}
      </div>
    </div>
  );
}

export function ProjectDashboard() {
  const { jobs, quotes, openJob, setActiveTab, setActiveId, setView, documents } = usePlumbTrackCtx();

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== "completed"), [jobs]);
  const today = todayStr();

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

  const expired = documents.filter((d) => expiryState(d.expiresOn) === "expired");
  const soon = documents.filter((d) => expiryState(d.expiresOn) === "soon");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
      {/* Stats — Hardware chassis with telemetry */}
      <div className="widget-chassis">
        <header className="widget-header" style={{ marginBottom: "16px" }}>
          <span className="label-micro">Shift Telemetry</span>
        </header>
        <hr className="hairline-divider" />

        <div className="telemetry-grid" style={{ marginBottom: "0" }}>
          <div className="telemetry-data" style={{ gap: "24px" }}>
            <StatTile value={crewClockedIn} label="CREW" />
            <StatTile value={activeJobs.length} label="JOBS" />
            <StatTile value={Math.floor(totalHoursWeek / 3600)} label="HRS" />
          </div>
        </div>
      </div>

      {/* Daily Reports */}
      <div className="widget-chassis">
        <button
          type="button"
          onClick={() => {
            const target = reportsDueJobs[0] ?? activeJobs[0];
            if (!target) return;
            setActiveId(target.id);
            setView("dailyReport");
          }}
          className="w-full text-left"
        >
          <header className="widget-header" style={{ marginBottom: "16px" }}>
            <div className="status-indicator">
              <CheckCircle2 size={14} style={{ color: "var(--text-secondary)" }} />
              <span className="label-micro">Daily Reports</span>
            </div>
            <span className={`label-micro ${reportsDue === 0 ? "" : ""}`}
              style={{ color: reportsDue === 0 ? "var(--status-complete)" : "var(--status-urgent)" }}
            >
              {reportsDue === 0 ? "✓ DONE" : `${reportsDue} DUE`}
            </span>
          </header>
          <hr className="hairline-divider" style={{ margin: "0 0 12px 0" }} />
          
          {/* Progress */}
          <div style={{ 
            height: "4px", 
            background: "var(--surface-border)", 
            borderRadius: "2px",
            overflow: "hidden"
          }}>
            <div style={{ 
              height: "100%", 
              background: "var(--chrome-400)", 
              width: `${((activeJobs.length - reportsDue) / Math.max(1, activeJobs.length)) * 100}%`,
              transition: "width 300ms ease"
            }} />
          </div>
          <div className="label-micro" style={{ marginTop: "8px" }}>
            {activeJobs.length - reportsDue}/{activeJobs.length} SUBMITTED
          </div>
        </button>
      </div>

      {/* Compliance */}
      {(expired.length + soon.length) > 0 && (
        <div className="widget-chassis">
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className="w-full text-left"
          >
            <header className="widget-header" style={{ marginBottom: "16px" }}>
              <div className="status-indicator">
                <ShieldAlert size={14} style={{ color: "var(--status-urgent)" }} />
                <span className="label-micro">Compliance</span>
              </div>
              <span className="label-micro" style={{ color: "var(--status-urgent)" }}>
                {expired.length > 0 ? `${expired.length} EXPIRED` : `${soon.length} EXPIRING`}
              </span>
            </header>
            <hr className="hairline-divider" style={{ margin: "0 0 12px 0" }} />
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[...expired, ...soon].slice(0, 3).map((doc) => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className={`status-dot ${expiryState(doc.expiresOn) === "expired" ? "urgent" : ""}`}
                    style={{ width: "6px", height: "6px" }}
                  />
                  <span className="task-detail" style={{ flex: 1 }}>
                    {doc.name}
                  </span>
                  {doc.jobId && (
                    <span className="work-order-id" style={{ fontSize: "0.7rem" }}>
                      {formatSerial(doc.jobId)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </button>
        </div>
      )}

      {/* Active Jobs */}
      <div>
        <div className="label-micro" style={{ marginBottom: "12px" }}>
          ACTIVE JOBS · {activeJobs.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activeJobs.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => openJob(j.id)}
              className="widget-chassis"
              style={{ 
                padding: "16px", 
                textAlign: "left",
                cursor: "pointer",
                transition: "transform 100ms ease"
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div className="text-title">{j.client}</div>
              <div className="task-detail" style={{ marginTop: "4px" }}>{j.scope}</div>
              {j.timeEntries.some((e) => e.end === null) && (
                <div className="label-micro" style={{ marginTop: "8px", color: "var(--chrome-400)" }}>
                  {j.timeEntries.filter((e) => e.end === null).length} ON SITE
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes */}
      {openQuotes.length > 0 && (
        <div>
          <div className="label-micro" style={{ marginBottom: "12px" }}>
            PENDING QUOTES · {openQuotes.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {openQuotes.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveTab("quotes")}
                className="widget-chassis"
                style={{ padding: "16px", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="text-title">{q.client}</div>
                  <span className="label-micro" style={{ color: "var(--status-pending)" }}>
                    {q.status}
                  </span>
                </div>
                <div className="task-detail" style={{ marginTop: "4px" }}>{q.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

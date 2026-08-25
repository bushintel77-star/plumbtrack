"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  FileCheck2,
  Mic,
  Radio,
  Receipt,
  WifiOff,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { buildJobActivity } from "@/lib/activity";
import type { ActivityKind, Job, JobActivity, SlackMember } from "@/types";
import type { OutboxStatus } from "@/hooks/useOutboxStatus";

// ── Instrumentation ────────────────────────────────────────────────────────
// Per-kind visual identity: tinted node, ring, and tag colour. Class strings
// are literal so Tailwind can see every variant.

const KIND_STYLE: Record<ActivityKind, { icon: typeof Clock3; node: string; tag: string }> = {
  time: { icon: Clock3, node: "bg-cyan-400/10 border-cyan-400/25 text-cyan-300", tag: "text-cyan-300/80 border-cyan-400/15 bg-cyan-400/[0.06]" },
  photo: { icon: Camera, node: "bg-violet-400/10 border-violet-400/25 text-violet-300", tag: "text-violet-300/80 border-violet-400/15 bg-violet-400/[0.06]" },
  note: { icon: Mic, node: "bg-emerald-400/10 border-emerald-400/25 text-emerald-300", tag: "text-emerald-300/80 border-emerald-400/15 bg-emerald-400/[0.06]" },
  material: { icon: Receipt, node: "bg-orange-400/10 border-orange-400/25 text-orange-300", tag: "text-orange-300/80 border-orange-400/15 bg-orange-400/[0.06]" },
  safety: { icon: FileCheck2, node: "bg-sky-400/10 border-sky-400/25 text-sky-300", tag: "text-sky-300/80 border-sky-400/15 bg-sky-400/[0.06]" },
  signature: { icon: CheckCircle2, node: "bg-green-400/10 border-green-400/25 text-green-300", tag: "text-green-300/80 border-green-400/15 bg-green-400/[0.06]" },
  invoice: { icon: Receipt, node: "bg-pink-400/10 border-pink-400/25 text-pink-300", tag: "text-pink-300/80 border-pink-400/15 bg-pink-400/[0.06]" },
};

const KIND_LABEL: Record<ActivityKind, string> = {
  time: "time",
  photo: "photo",
  note: "note",
  material: "material",
  safety: "check",
  signature: "sign-off",
  invoice: "invoice",
};

const fmtDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};

function exactTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function exactDate(value: string): string {
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(value: string): string {
  const day = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(day, today)) return "Today";
  if (sameDay(day, yesterday)) return "Yesterday";
  return day.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function staffName(staffId: string | undefined, members: SlackMember[]): string {
  if (!staffId) return "PlumbTrack";
  return members.find((member) => member.id === staffId)?.name.split(" ")[0] ?? "Technician";
}

function staffColor(staffId: string | undefined, members: SlackMember[]): string {
  return members.find((member) => member.id === staffId)?.color ?? "#64748b";
}

function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

// ── Day grouping ────────────────────────────────────────────────────────────

function groupByDay(events: JobActivity[]): { label: string; date: string; events: JobActivity[] }[] {
  const groups: { label: string; date: string; events: JobActivity[] }[] = [];
  for (const event of events) {
    const date = new Date(event.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.events.push(event);
    else groups.push({ label: dayLabel(event.createdAt), date, events: [event] });
  }
  return groups;
}

function ActivityRow({ event, members, isLast }: { event: JobActivity; members: SlackMember[]; isLast: boolean }) {
  const kind = KIND_STYLE[event.kind] ?? KIND_STYLE.time;
  const Icon = kind.icon;
  const chips: { key: string; children: ReactNode; className: string }[] = [];

  if (event.staffId) {
    chips.push({
      key: "staff",
      className: "border-white/[0.08] bg-white/[0.04] text-slate-400",
      children: (
        <>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: staffColor(event.staffId, members) }} />
          {staffName(event.staffId, members)}
        </>
      ),
    });
  }
  if (event.elapsedSeconds !== undefined) {
    chips.push({
      key: "elapsed",
      className: kind.tag,
      children: (
        <>
          <Clock3 size={9} /> {fmtDuration(event.elapsedSeconds)}
        </>
      ),
    });
  }
  if (event.meta) {
    chips.push({ key: "meta", className: "border-white/[0.06] bg-white/[0.02] text-slate-500", children: event.meta });
  }

  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0 group">
      {/* Rail */}
      <div className="relative flex flex-col items-center shrink-0">
        <span
          className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition group-hover:scale-105 ${kind.node}`}
        >
          <Icon size={15} />
        </span>
        {!isLast && (
          <span
            className="absolute top-9 bottom-[-14px] w-px bg-gradient-to-b from-white/[0.14] via-white/[0.07] to-transparent"
            aria-hidden
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-200 truncate">{event.title}</p>
          <time
            dateTime={event.createdAt}
            title={exactDate(event.createdAt)}
            className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0"
          >
            {exactTime(event.createdAt)}
          </time>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.detail}</p>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {chips.map((chip) => (
              <Tag key={chip.key} className={chip.className}>
                {chip.children}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workflow status ─────────────────────────────────────────────────────────

function IntegrationStatus({ label, detail, state, icon: Icon }: { label: string; detail: string; state: "ready" | "queued" | "attention"; icon: typeof Cloud }) {
  const stateLabel = state === "ready" ? "Ready" : state === "queued" ? "Queued" : "Attention";
  const stateClass = state === "ready" ? "text-accent" : state === "queued" ? "text-amber-300" : "text-red-300";
  const dotClass = state === "ready" ? "bg-accent" : state === "queued" ? "bg-amber-300 animate-pulse" : "bg-red-300";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon size={15} className={stateClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-300 font-semibold">{label}</p>
        <p className="text-[10px] text-slate-600 truncate">{detail}</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold ${stateClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {stateLabel}
      </span>
    </div>
  );
}

// ── Main timeline ───────────────────────────────────────────────────────────

export function JobActivityTimeline({ job, members, online, syncStatus }: { job: Job; members: SlackMember[]; online: boolean; syncStatus: OutboxStatus }) {
  const events = useMemo(() => buildJobActivity(job), [job]);
  const groups = useMemo(() => groupByDay(events), [events]);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Live instrument clock — keeps the console strip ticking while the job is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasPending = !online || syncStatus.pending > 0 || syncStatus.processing > 0;
  const hasXero = Boolean(job.xeroSyncedAt);
  const slackState = syncStatus.failed > 0 ? "attention" : hasPending ? "queued" : "ready";
  const pendingCount = syncStatus.pending + syncStatus.processing;

  // Kind breakdown for the header read-out.
  const kindCounts = useMemo(() => {
    const counts = new Map<ActivityKind, number>();
    for (const event of events) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    return counts;
  }, [events]);

  // Expandable journal: first 5 rows, then "show all".
  const collapsedByDay: { label: string; date: string; events: JobActivity[] }[] = [];
  let shown = 0;
  for (const group of groups) {
    const take = expanded ? group.events.length : Math.max(0, Math.min(group.events.length, 5 - shown));
    if (take > 0) collapsedByDay.push({ ...group, events: group.events.slice(0, take) });
    shown += take;
    if (!expanded && shown >= 5) break;
  }

  const totalCount = events.length;
  const visibleCount = collapsedByDay.reduce((sum, g) => sum + g.events.length, 0);

  return (
    <div className="space-y-2">
      <GlassCard className="!p-4">
        {/* Header read-out */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Job activity</p>
            <p className="text-[11px] text-slate-600 mt-0.5">One record for field, customer and HQ updates</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-accent">
              <Activity size={11} /> {totalCount} evt
            </span>
          </div>
        </div>

        {/* Kind breakdown — layered read-out */}
        {kindCounts.size > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {[...kindCounts.entries()].map(([kind, count]) => (
              <span key={kind} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-mono tabular-nums tracking-wide text-slate-500 border-white/[0.06] bg-white/[0.02]`}>
                {KIND_LABEL[kind]} × {count}
              </span>
            ))}
          </div>
        )}

        {/* Journal */}
        {visibleCount === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-3 py-4 text-center">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600">No field activity yet</p>
            <p className="text-xs text-slate-500 mt-1">Clock on to open the job journal.</p>
          </div>
        ) : (
          <div>
            {collapsedByDay.map((group, gi) => (
              <div key={group.date}>
                {gi > 0 && <div className="my-1.5 border-t border-white/[0.05]" />}
                <div className="flex items-center gap-2 pb-1 pt-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{group.label}</p>
                  <p className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" aria-hidden />
                  <p className="text-[9px] font-mono tabular-nums text-slate-700">{group.events.length}</p>
                </div>
                {group.events.map((event, ei) => (
                  <ActivityRow
                    key={event.id}
                    event={event}
                    members={members}
                    isLast={gi === collapsedByDay.length - 1 && ei === group.events.length - 1}
                  />
                ))}
              </div>
            ))}

            {/* Expand / collapse */}
            {!expanded && totalCount > visibleCount && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-2 w-full min-h-[44px] rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 active:bg-white/[0.07] transition haptic"
              >
                Show all {totalCount} events <ChevronDown size={14} className="text-slate-500" />
              </button>
            )}
            {expanded && totalCount > 5 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="mt-2 w-full min-h-[44px] rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.07] transition haptic"
              >
                Show fewer <ChevronUp size={14} className="text-slate-500" />
              </button>
            )}
          </div>
        )}

        {/* Console strip */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-accent animate-pulse" : "bg-amber-300 animate-pulse"}`} aria-hidden />
          <span className={online ? "text-slate-400" : "text-amber-200"}>{online ? "Live" : "Offline"}</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-500">
            {pendingCount > 0 ? `${pendingCount} queued` : "all synced"}
          </span>
          <span className="flex-1" />
          <time className="text-slate-600 tabular-nums">{exactTime(now.toISOString())}</time>
        </div>
      </GlassCard>

      {/* Connected workflow */}
      <GlassCard className="!p-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connected workflow</p>
          {online ? <Radio size={14} className="text-accent" /> : <WifiOff size={14} className="text-amber-300" />}
        </div>
        <div className="space-y-2.5">
          <IntegrationStatus icon={Cloud} label="PlumbTrack" detail={online ? "Saved on this device and server" : "Saved locally — will sync when online"} state={online ? "ready" : "queued"} />
          <IntegrationStatus icon={Radio} label="Slack HQ" detail={syncStatus.failed > 0 ? "A delivery needs attention" : hasPending ? syncStatus.label : "Automatic handoff via dispatcher"} state={slackState} />
          <IntegrationStatus icon={Receipt} label="Xero" detail={hasXero ? "Invoice draft created" : "Runs automatically after sign-off"} state={hasXero ? "ready" : "queued"} />
        </div>
        {(syncStatus.pending > 0 || syncStatus.processing > 0 || syncStatus.failed > 0) && (
          <div className={`mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-2 text-[10px] ${syncStatus.failed > 0 ? "text-red-300" : "text-amber-200"}`}>
            <Cloud size={13} /> {syncStatus.label}
          </div>
        )}
        {syncStatus.pending === 0 && syncStatus.processing === 0 && syncStatus.failed === 0 && online && (
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-2 text-[10px] text-slate-600">
            <Check size={13} className="text-accent" /> No action required
          </div>
        )}
      </GlassCard>
    </div>
  );
}
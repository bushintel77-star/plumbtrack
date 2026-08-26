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
  time: { icon: Clock3, node: "activity-node", tag: "activity-tag" },
  photo: { icon: Camera, node: "activity-node", tag: "activity-tag" },
  note: { icon: Mic, node: "activity-node activity-complete", tag: "activity-tag activity-complete" },
  material: { icon: Receipt, node: "activity-node", tag: "activity-tag" },
  safety: { icon: FileCheck2, node: "activity-node activity-accent", tag: "activity-tag activity-accent" },
  signature: { icon: CheckCircle2, node: "activity-node activity-complete", tag: "activity-tag activity-complete" },
  invoice: { icon: Receipt, node: "activity-node activity-urgent", tag: "activity-tag activity-urgent" },
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
  return members.find((member) => member.id === staffId)?.color ?? "var(--bg-fallback-member)";
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
      className: "border-line bg-fill text-ink-low",
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
    chips.push({ key: "meta", className: "border-line bg-fill text-ink-low", children: event.meta });
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
            className="absolute top-9 bottom-[-14px] w-px bg-gradient-to-b from-fill-strong via-fill to-transparent"
            aria-hidden
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink-mid truncate">{event.title}</p>
          <time
            dateTime={event.createdAt}
            title={exactDate(event.createdAt)}
            className="text-[10px] font-mono tabular-nums text-ink-low shrink-0"
          >
            {exactTime(event.createdAt)}
          </time>
        </div>
        <p className="text-xs text-ink-low mt-0.5 line-clamp-2">{event.detail}</p>
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
  const stateClass = state === "ready" ? "text-accent" : state === "queued" ? "text-pending" : "text-urgent";
  const dotClass = state === "ready" ? "bg-accent" : state === "queued" ? "bg-pending animate-pulse" : "bg-urgent";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon size={15} className={stateClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-mid font-semibold">{label}</p>
        <p className="text-[10px] text-ink-low truncate">{detail}</p>
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
            <p className="text-xs font-bold text-ink-mid uppercase tracking-wider">Job activity</p>
            <p className="text-[11px] text-ink-low mt-0.5">One record for field, customer and HQ updates</p>
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
              <span key={kind} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-mono tabular-nums tracking-wide text-ink-low border-line bg-fill`}>
                {KIND_LABEL[kind]} × {count}
              </span>
            ))}
          </div>
        )}

        {/* Journal */}
        {visibleCount === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center">
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-low">No field activity yet</p>
            <p className="text-xs text-ink-low mt-1">Clock on to open the job journal.</p>
          </div>
        ) : (
          <div>
            {collapsedByDay.map((group, gi) => (
              <div key={group.date}>
                {gi > 0 && <div className="my-1.5 border-t border-line" />}
                <div className="flex items-center gap-2 pb-1 pt-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-ink-low">{group.label}</p>
                  <p className="h-px flex-1 bg-gradient-to-r from-fill to-transparent" aria-hidden />
                  <p className="text-[9px] font-mono tabular-nums text-ink-low">{group.events.length}</p>
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
                className="mt-2 w-full min-h-[44px] rounded-xl border border-line bg-fill flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-low active:bg-fill-strong transition haptic"
              >
                Show all {totalCount} events <ChevronDown size={14} className="text-ink-low" />
              </button>
            )}
            {expanded && totalCount > 5 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="mt-2 w-full min-h-[44px] rounded-xl border border-line bg-fill flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-mid hover:bg-fill-strong transition haptic"
              >
                Show fewer <ChevronUp size={14} className="text-ink-low" />
              </button>
            )}
          </div>
        )}

        {/* Console strip */}
        <div className="mt-3 pt-2.5 border-t border-line flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-accent animate-pulse" : "bg-pending animate-pulse"}`} aria-hidden />
          <span className={online ? "text-ink-low" : "text-pending"}>{online ? "Live" : "Offline"}</span>
          <span className="text-ink-low">·</span>
          <span className="text-ink-low">
            {pendingCount > 0 ? `${pendingCount} queued` : "all synced"}
          </span>
          <span className="flex-1" />
          <time className="text-ink-low tabular-nums">{exactTime(now.toISOString())}</time>
        </div>
      </GlassCard>

      {/* Connected workflow */}
      <GlassCard className="!p-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-bold text-ink-low uppercase tracking-wider">Connected workflow</p>
          {online ? <Radio size={14} className="text-accent" /> : <WifiOff size={14} className="text-pending" />}
        </div>
        <div className="space-y-2.5">
          <IntegrationStatus icon={Cloud} label="PlumbTrack" detail={online ? "Saved on this device and server" : "Saved locally — will sync when online"} state={online ? "ready" : "queued"} />
          <IntegrationStatus icon={Radio} label="Slack HQ" detail={syncStatus.failed > 0 ? "A delivery needs attention" : hasPending ? syncStatus.label : "Automatic handoff via dispatcher"} state={slackState} />
          <IntegrationStatus icon={Receipt} label="Xero" detail={hasXero ? "Invoice draft created" : "Runs automatically after sign-off"} state={hasXero ? "ready" : "queued"} />
        </div>
        {(syncStatus.pending > 0 || syncStatus.processing > 0 || syncStatus.failed > 0) && (
          <div className={`mt-3 pt-2.5 border-t border-line flex items-center gap-2 text-[10px] ${syncStatus.failed > 0 ? "text-urgent" : "text-pending"}`}>
            <Cloud size={13} /> {syncStatus.label}
          </div>
        )}
        {syncStatus.pending === 0 && syncStatus.processing === 0 && syncStatus.failed === 0 && online && (
          <div className="mt-3 pt-2.5 border-t border-line flex items-center gap-2 text-[10px] text-ink-low">
            <Check size={13} className="text-accent" /> No action required
          </div>
        )}
      </GlassCard>
    </div>
  );
}
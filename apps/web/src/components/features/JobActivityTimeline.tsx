"use client";

import { Activity, Camera, Check, CheckCircle2, Clock3, Cloud, FileCheck2, Mic, Radio, Receipt, WifiOff } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { buildJobActivity } from "@/lib/activity";
import type { Job, JobActivity, SlackMember } from "@/types";
import type { OutboxStatus } from "@/hooks/useOutboxStatus";

const ICONS: Record<JobActivity["kind"], typeof Activity> = {
  time: Clock3,
  photo: Camera,
  note: Mic,
  material: Receipt,
  safety: FileCheck2,
  signature: CheckCircle2,
  invoice: Receipt,
};

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (timestamp === 0) return "Earlier";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function staffName(staffId: string | undefined, members: SlackMember[]): string {
  if (!staffId) return "PlumbTrack";
  return members.find((member) => member.id === staffId)?.name.split(" ")[0] ?? "Technician";
}

function ActivityRow({ event, members }: { event: JobActivity; members: SlackMember[] }) {
  const Icon = ICONS[event.kind];
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="relative flex flex-col items-center">
        <span className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] text-accent flex items-center justify-center shrink-0">
          <Icon size={15} />
        </span>
        <span className="absolute top-9 bottom-[-10px] w-px bg-white/[0.07] last:hidden" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-slate-200 truncate">{event.title}</p>
          <time className="text-[10px] text-slate-600 shrink-0">{relativeTime(event.createdAt)}</time>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.detail}</p>
        {event.staffId && <p className="text-[10px] text-slate-600 mt-1">{staffName(event.staffId, members)}</p>}
      </div>
    </div>
  );
}

function IntegrationStatus({ label, detail, state, icon: Icon }: { label: string; detail: string; state: "ready" | "queued" | "attention"; icon: typeof Cloud }) {
  const stateLabel = state === "ready" ? "Ready" : state === "queued" ? "Queued" : "Attention";
  const stateClass = state === "ready" ? "text-accent" : state === "queued" ? "text-amber-300" : "text-red-300";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon size={15} className={stateClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-300 font-semibold">{label}</p>
        <p className="text-[10px] text-slate-600 truncate">{detail}</p>
      </div>
      <span className={`text-[9px] uppercase tracking-wider font-bold ${stateClass}`}>{stateLabel}</span>
    </div>
  );
}

export function JobActivityTimeline({ job, members, online, syncStatus }: { job: Job; members: SlackMember[]; online: boolean; syncStatus: OutboxStatus }) {
  const events = buildJobActivity(job);
  const hasPending = !online || syncStatus.pending > 0 || syncStatus.processing > 0;
  const hasXero = Boolean(job.xeroSyncedAt);
  const slackState = syncStatus.failed > 0 ? "attention" : hasPending ? "queued" : "ready";

  return (
    <div className="space-y-2">
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Job activity</p>
            <p className="text-[11px] text-slate-600 mt-0.5">One record for field, customer and HQ updates</p>
          </div>
          <Activity size={17} className="text-accent" />
        </div>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-3 py-4 text-center">
            <p className="text-xs text-slate-500">Your first job update will appear here.</p>
          </div>
        ) : (
          <div>{events.slice(0, 5).map((event) => <ActivityRow key={event.id} event={event} members={members} />)}</div>
        )}
        {events.length > 5 && <p className="text-[10px] text-slate-600 mt-3">Showing the latest 5 updates</p>}
      </GlassCard>

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
        {syncStatus.pending === 0 && syncStatus.processing === 0 && syncStatus.failed === 0 && online && <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-2 text-[10px] text-slate-600"><Check size={13} className="text-accent" /> No action required</div>}
      </GlassCard>
    </div>
  );
}

"use client";

import type { JobStatus } from "@/types";
import {
  IconClockWait,
  IconCloudFail,
  IconCloudQueue,
  IconCloudSync,
  IconDropAlert,
  IconSealCheck,
  IconTapFlow,
} from "@/components/icons/FieldIcons";

// ── Status tokens ───────────────────────────────────────────────────────────
// One semantic status system for job state, used everywhere: color + bespoke
// icon + label together, never color alone (colorblind-safe, glare-legible).
// Aligned to site convention: red = urgent, amber = pending, emerald = done.

const STATUS_TOKENS = {
  scheduled: { icon: IconClockWait, label: "Scheduled", color: "#D97706", bg: "rgba(217,119,6,0.13)", border: "rgba(217,119,6,0.32)" },
  in_progress: { icon: IconTapFlow, label: "On site", color: "#EA580C", bg: "rgba(234,88,12,0.13)", border: "rgba(234,88,12,0.32)" },
  completed: { icon: IconSealCheck, label: "Complete", color: "#059669", bg: "rgba(5,150,105,0.12)", border: "rgba(5,150,105,0.3)" },
  emergency: { icon: IconDropAlert, label: "Emergency", color: "#DC2626", bg: "rgba(220,38,38,0.13)", border: "rgba(220,38,38,0.32)" },
} as const;

export function StatusChip({ status, size = 13, className = "" }: { status: JobStatus | "emergency"; size?: number; className?: string }) {
  const token = STATUS_TOKENS[status];
  const Icon = token.icon;
  return (
    <span
      suppressHydrationWarning
      className={`inline-flex items-center gap-1.5 min-h-[26px] rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider border ${className}`}
      style={{ color: token.color, background: token.bg, borderColor: token.border }}
    >
      <Icon size={size} />
      {token.label}
    </span>
  );
}

// ── Sync honesty badges ─────────────────────────────────────────────────────

export type SyncBadgeState = "synced" | "queued" | "syncing" | "failed";

const SYNC_TOKENS: Record<Exclude<SyncBadgeState, "synced">, { icon: typeof IconCloudQueue; color: string; label: string }> = {
  queued: { icon: IconCloudQueue, color: "#F59E0B", label: "Queued" },
  syncing: { icon: IconCloudSync, color: "#38BDF8", label: "Syncing" },
  failed: { icon: IconCloudFail, color: "#F87171", label: "Retry needed" },
};

/** Compact offline-honesty badge; renders nothing while fully synced. */
export function SyncBadge({ state, count, size = 12 }: { state: SyncBadgeState; count?: number; size?: number }) {
  if (state === "synced") return null;
  const token = SYNC_TOKENS[state];
  const Icon = token.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
      style={{ color: token.color, background: "rgba(255,255,255,0.05)", border: `1px solid ${token.color}44` }}
      aria-label={`${token.label}${count && count > 1 ? ` (${count})` : ""}`}
    >
      <Icon size={size} />
      {count !== undefined && count > 1 ? `${count} ${token.label.toLowerCase()}` : token.label}
    </span>
  );
}

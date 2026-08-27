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
// Color is spent on exceptions only: red = urgent, amber = attention needed,
// emerald = done. Default states stay neutral so warning colors keep their
// scarcity — when everything is amber, nothing is. "On site" reads as active
// work (accent), not a caution state.

const STATUS_TOKENS = {
  scheduled: { icon: IconClockWait, label: "Scheduled", color: "var(--text-muted)", bg: "var(--surface-hover-subtle)", border: "var(--surface-border)" },
  in_progress: { icon: IconTapFlow, label: "On site", color: "var(--accent)", bg: "var(--accent-dim)", border: "var(--accent-border)" },
  completed: { icon: IconSealCheck, label: "Complete", color: "var(--status-complete)", bg: "var(--status-complete-dim)", border: "var(--status-complete-border)" },
  emergency: { icon: IconDropAlert, label: "Emergency", color: "var(--status-urgent)", bg: "var(--status-urgent-dim)", border: "var(--status-urgent-border)" },
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
  queued: { icon: IconCloudQueue, color: "var(--status-pending)", label: "Queued" },
  syncing: { icon: IconCloudSync, color: "var(--color-info)", label: "Syncing" },
  failed: { icon: IconCloudFail, color: "var(--status-urgent)", label: "Retry needed" },
};

/** Compact offline-honesty badge; renders nothing while fully synced. */
export function SyncBadge({ state, count, size = 12 }: { state: SyncBadgeState; count?: number; size?: number }) {
  if (state === "synced") return null;
  const token = SYNC_TOKENS[state];
  const Icon = token.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: token.color, background: "var(--surface-hover-subtle)", border: `1px solid var(--divider-etch)` }}
      aria-label={`${token.label}${count && count > 1 ? ` (${count})` : ""}`}
    >
      <Icon size={size} />
      {count !== undefined && count > 1 ? `${count} ${token.label.toLowerCase()}` : token.label}
    </span>
  );
}
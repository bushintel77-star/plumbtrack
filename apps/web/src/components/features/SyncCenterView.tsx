"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Cloud, RefreshCw, Trash2, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { listOutboxOperations, subscribeToOutbox } from "@/lib/outbox";
import type { OutboxOperation } from "@/types";

function operationLabel(operation: OutboxOperation): string {
  switch (operation.kind) {
    case "photo-upload": return "Photo upload";
    case "notification": return "Slack / HQ update";
    case "clock-in": return "Clock-in";
    case "clock-out": return "Clock-out";
    case "create-job": return "Create job";
    case "sync-quote": return "Quote update";
    default: return "Field update";
  }
}

function operationDetail(operation: OutboxOperation): string {
  const payload = operation.payload as { label?: unknown; text?: unknown; jobId?: unknown };
  if (operation.kind === "photo-upload") return `${String(payload.label ?? "Photo")} · ${String(payload.jobId ?? "Job")}`;
  if (operation.kind === "notification") return String(payload.text ?? "HQ update");
  return String(payload.jobId ?? "Waiting for server acknowledgement");
}

function retryTime(operation: OutboxOperation): string {
  if (operation.status === "failed_requires_user_action") return "Action required";
  if (operation.status === "processing") return "Processing now";
  if (operation.nextRetryTimestamp <= Date.now()) return "Ready to sync";
  return `Retrying in ${Math.max(1, Math.ceil((operation.nextRetryTimestamp - Date.now()) / 1000))}s`;
}

export function SyncCenterView() {
  const { syncStatus, retrySyncOperation, retryFailedSync, discardFailedSync } = usePlumbTrackCtx();
  const [operations, setOperations] = useState<OutboxOperation[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listOutboxOperations().then((items) => {
        if (!cancelled) setOperations(items);
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToOutbox(refresh);
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-ink-mid uppercase tracking-wider">Sync centre</p>
            <p className="text-xs text-ink-low mt-1">Field work is saved locally first and delivered in the background.</p>
          </div>
          <Cloud size={20} className={syncStatus.failed > 0 ? "text-urgent" : syncStatus.pending > 0 ? "text-pending" : "text-accent"} />
        </div>
        <div className="mt-3 rounded-xl bg-fill border border-line px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-low">{syncStatus.label}</span>
          <span className="text-2xs text-ink-low">{operations.length} queued</span>
        </div>
      </GlassCard>

      {operations.length === 0 ? (
        <GlassCard>
          <div className="py-8 text-center">
            <Check size={24} className="text-accent mx-auto mb-2" />
            <p className="text-sm font-semibold text-ink">Everything is up to date</p>
            <p className="text-xs text-ink-low mt-1">No field updates need delivery.</p>
          </div>
        </GlassCard>
      ) : (
        operations.map((operation) => {
          const failed = operation.status === "failed_requires_user_action";
          return (
            <GlassCard key={operation.id} className="!p-3">
              <div className="flex items-start gap-3">
                <span
                  className={`icon-socket ${failed ? "icon-socket--urgent" : operation.kind === "photo-upload" ? "icon-socket--accent" : ""}`}
                  style={{ width: "36px", height: "36px" }}
                >
                  {failed ? <AlertTriangle size={16} /> : operation.kind === "photo-upload" ? <Upload size={16} /> : <Cloud size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{operationLabel(operation)}</p>
                    <span className={`text-2xs uppercase tracking-wider font-bold shrink-0 ${failed ? "text-urgent" : operation.status === "processing" ? "text-accent" : "text-pending"}`}>
                      {failed ? "Needs attention" : operation.status}
                    </span>
                  </div>
                  <p className="text-xs text-ink-low mt-1 truncate">{operationDetail(operation)}</p>
                  <p className={`text-2xs mt-1 ${failed ? "text-urgent" : "text-ink-low"}`}>{failed ? operation.lastError : retryTime(operation)}</p>
                </div>
              </div>
              {failed && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                  <button type="button" onClick={() => { void retrySyncOperation(operation.id); }} className="flex-1 min-h-[44px] rounded-xl bg-accent-dim text-accent text-xs font-semibold border border-accent-line flex items-center justify-center gap-1.5"><RefreshCw size={14} /> Retry</button>
                  <button type="button" onClick={() => { void discardFailedSync(); }} className="min-h-[44px] px-3 rounded-xl bg-fill text-ink-low text-xs font-semibold border border-line" aria-label="Dismiss failed updates"><Trash2 size={14} /></button>
                </div>
              )}
            </GlassCard>
          );
        })
      )}

      {syncStatus.failed > 0 && operations.length > 1 && (
        <button type="button" onClick={() => { void retryFailedSync(); }} className="w-full min-h-[48px] rounded-xl bg-fill border border-line text-ink-mid text-xs font-semibold">Retry all failed updates</button>
      )}
    </div>
  );
}

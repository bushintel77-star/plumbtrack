"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RefreshCw, RotateCcw, Wifi } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { integrationsApi, type IntegrationDelivery, type IntegrationHealth } from "@/lib/integrations";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: IntegrationDelivery["status"]): string {
  return status === "dead_letter" ? "Dead letter" : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: IntegrationDelivery["status"]): string {
  if (status === "delivered") return "text-accent bg-accent/15 border-accent/25";
  if (status === "failed" || status === "dead_letter") return "text-urgent bg-urgent-dim border-urgent-line";
  if (status === "processing") return "text-pending bg-pending-dim border-pending-line";
  return "text-ink-low bg-fill border-line";
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "warning" }) {
  return (
    <div className="surface-inset p-3 min-h-[76px]">
      <p className="text-[10px] uppercase tracking-wider text-ink-low font-bold">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone === "good" ? "text-accent" : tone === "warning" ? "text-urgent" : "text-ink"}`}>{value}</p>
    </div>
  );
}

export function IntegrationHealthView() {
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [deliveries, setDeliveries] = useState<IntegrationDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const [nextHealth, nextDeliveries] = await Promise.all([integrationsApi.health(), integrationsApi.deliveries()]);
      setHealth(nextHealth);
      setDeliveries(nextDeliveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load integration health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const attention = useMemo(() => deliveries.filter((delivery) => delivery.status === "failed" || delivery.status === "dead_letter"), [deliveries]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      await integrationsApi.retry(id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry could not be queued");
    } finally {
      setRetrying(null);
    }
  }

  if (loading) {
    return <div className="p-5 flex items-center justify-center gap-2 text-ink-low"><RefreshCw size={16} className="animate-spin" /> Loading integration health…</div>;
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-accent font-bold">HQ operations</p>
          <h2 className="text-lg font-semibold text-ink mt-0.5">Integration health</h2>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="min-h-[44px] min-w-[44px] rounded-xl surface-card flex items-center justify-center text-ink-low disabled:opacity-50" aria-label="Refresh integration health">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <div className="surface-card border-urgent-line bg-urgent-dim p-3 text-xs text-urgent flex items-center gap-2"><AlertTriangle size={15} />{error}</div>}

      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Wifi size={16} className={health?.needsAttention ? "text-urgent" : "text-accent"} /><p className="text-sm font-semibold text-ink">Dispatcher status</p></div>
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${health?.needsAttention ? "text-urgent bg-urgent-dim border-urgent-line" : "text-accent bg-accent/15 border-accent/25"}`}>{health?.needsAttention ? "Needs attention" : "Healthy"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Delivered" value={health?.delivered ?? 0} tone="good" />
          <Stat label="Pending" value={health?.pending ?? 0} />
          <Stat label="Processing" value={health?.processing ?? 0} />
          <Stat label="Failed / dead" value={(health?.failed ?? 0) + (health?.deadLetter ?? 0)} tone="warning" />
        </div>
      </GlassCard>

      <div className="flex items-center justify-between px-1 pt-1"><p className="text-[11px] uppercase tracking-wider text-ink-low font-bold">Recent deliveries</p><span className="text-[10px] text-ink-low">Auto-refresh 15s</span></div>

      {deliveries.length === 0 ? (
        <GlassCard><p className="text-sm text-ink-low text-center py-5">No integration deliveries recorded yet.</p></GlassCard>
      ) : (
        deliveries.map((delivery) => {
          const canRetry = delivery.status === "failed" || delivery.status === "dead_letter";
          return (
            <GlassCard key={delivery.id}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${statusClass(delivery.status)}`}>
                  {delivery.status === "delivered" ? <CheckCircle2 size={16} /> : canRetry ? <AlertTriangle size={16} /> : <Clock3 size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{delivery.provider}</p><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border ${statusClass(delivery.status)}`}>{statusLabel(delivery.status)}</span></div>
                  <p className="text-[11px] text-ink-low mt-1">Created {formatDate(delivery.createdAt)} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}</p>
                  {delivery.lastError && <p className="text-xs text-urgent mt-2 line-clamp-2">{delivery.lastError}</p>}
                  {delivery.providerMessageId && <p className="text-[10px] text-ink-low mt-2 flex items-center gap-1"><ExternalLink size={11} /> Provider ID {delivery.providerMessageId}</p>}
                  {canRetry && <button type="button" onClick={() => void retry(delivery.id)} disabled={retrying === delivery.id} className="mt-3 min-h-[44px] rounded-xl px-3 bg-accent/15 text-accent border border-accent/25 text-xs font-bold flex items-center gap-2 disabled:opacity-50"><RotateCcw size={14} className={retrying === delivery.id ? "animate-spin" : ""} />{retrying === delivery.id ? "Queueing…" : "Retry delivery"}</button>}
                </div>
              </div>
              {delivery.attemptsHistory.length > 0 && <details className="mt-3 pt-3 border-t border-line"><summary className="text-[10px] text-ink-low cursor-pointer">View attempt history ({delivery.attemptsHistory.length})</summary><div className="mt-2 space-y-2">{delivery.attemptsHistory.map((attempt) => <div key={attempt.id} className="flex items-center justify-between text-[10px] text-ink-low"><span>Attempt {attempt.attemptNumber} · {attempt.status}</span><span>{attempt.httpStatus ?? "—"} · {formatDate(attempt.startedAt)}</span></div>)}</div></details>}
            </GlassCard>
          );
        })
      )}

      {attention.length > 0 && <p className="text-[10px] text-ink-low text-center px-4">Retries are available to authorised HQ roles. Field work continues even when a downstream provider is unavailable.</p>}
    </div>
  );
}

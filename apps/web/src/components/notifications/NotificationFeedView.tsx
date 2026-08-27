"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Hash,
  RefreshCw,
  Send,
  User,
} from "lucide-react";

import type { NotificationFeedItem } from "@/types";
import { fetchNotifications } from "@/lib/notifications";

// ── Poll intervals (ms) ────────────────────────────────────────────────────

const POLL_BASE = 10_000;
const POLL_BACKOFF_1 = 30_000;
const POLL_BACKOFF_2 = 60_000;

type FeedStatus = "loading" | "ready" | "error";
type DeliveryFilter = "all" | "delivered" | "failed" | "pending";

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function deliveryState(n: NotificationFeedItem): "delivered" | "failed" | "pending" {
  if (n.slackDelivered) return "delivered";
  if (n.slackError) return "failed";
  return "pending";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DeliveryBadge({ item }: { item: NotificationFeedItem }) {
  const state = deliveryState(item);
  if (state === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
        <CheckCircle2 size={10} />
        Delivered
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-urgent-dim text-urgent border border-urgent-line">
        <AlertTriangle size={10} />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-fill-strong text-ink-low border border-line">
      <Clock size={10} />
      Pending
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const isDm = channel.startsWith("dm-");
  return (
    <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-fill border border-line text-ink-low">
      {isDm ? `💬 ${channel.replace("dm-", "@")}` : `# ${channel}`}
    </span>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition min-h-[36px] ${
        active
          ? "bg-accent/15 text-accent border border-accent/25"
          : "bg-fill text-ink-low border border-line active:bg-fill-strong"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 ${
            active ? "bg-accent/25 text-accent" : "bg-fill-strong text-ink-low"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Detail view ────────────────────────────────────────────────────────────

function NotificationDetail({
  item,
  onBack,
}: {
  item: NotificationFeedItem;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-1 rounded-xl hover:bg-fill-strong active:bg-fill-strong transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to feed"
        >
          <ArrowLeft size={18} className="text-ink-low" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">Notification Detail</p>
        </div>
        <DeliveryBadge item={item} />
      </div>

      {/* Detail body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-border) transparent" }}>
        {/* Message */}
        <div className="surface-card p-5">
          <p className="text-[11px] font-bold text-ink-low uppercase tracking-wider mb-2">Message</p>
          <p className="text-[15px] text-ink leading-relaxed">{item.text}</p>
        </div>

        {/* Metadata */}
        <div className="surface-card p-4 space-y-3">
          <p className="text-[11px] font-bold text-ink-low uppercase tracking-wider">Metadata</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <Hash size={14} className="text-ink-low shrink-0" />
              <div>
                <p className="text-[10px] text-ink-low mb-0.5">Channel</p>
                <p className="text-sm text-ink font-medium">
                  {item.channel.startsWith("dm-")
                    ? `Direct message — ${item.channel.replace("dm-", "@")}`
                    : `# ${item.channel}`}
                </p>
              </div>
            </div>
            <div className="h-px bg-fill-strong" />
            <div className="flex items-center gap-3">
              <User size={14} className="text-ink-low shrink-0" />
              <div>
                <p className="text-[10px] text-ink-low mb-0.5">Author</p>
                <p className="text-sm text-ink font-medium">
                  {item.author === "plumbtrack" ? "🤖 PlumbTrack (bot)" : item.author}
                </p>
              </div>
            </div>
            <div className="h-px bg-fill-strong" />
            <div className="flex items-center gap-3">
              <Clock size={14} className="text-ink-low shrink-0" />
              <div>
                <p className="text-[10px] text-ink-low mb-0.5">Dispatched</p>
                <p className="text-sm text-ink font-medium">{fullTimestamp(item.createdAt)}</p>
                <p className="text-[10px] text-ink-low mt-0.5">{timeAgo(item.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery status */}
        <div className="surface-card p-4">
          <p className="text-[11px] font-bold text-ink-low uppercase tracking-wider mb-3">Slack Delivery</p>
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                deliveryState(item) === "delivered"
                  ? "bg-accent/15"
                  : deliveryState(item) === "failed"
                    ? "bg-urgent-dim"
                    : "bg-fill"
              }`}
            >
              {deliveryState(item) === "delivered" ? (
                <CheckCircle2 size={18} className="text-accent" />
              ) : deliveryState(item) === "failed" ? (
                <AlertTriangle size={18} className="text-urgent" />
              ) : (
                <Clock size={18} className="text-ink-low" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-ink font-medium">
                {deliveryState(item) === "delivered"
                  ? "Delivered to Slack"
                  : deliveryState(item) === "failed"
                    ? "Delivery failed"
                    : "Pending relay"}
              </p>
              <p className="text-[11px] text-ink-low mt-0.5">
                {deliveryState(item) === "delivered"
                  ? "The webhook accepted this message successfully."
                  : deliveryState(item) === "failed"
                    ? item.slackError
                    : "Waiting for the server-side relay to process."}
              </p>
            </div>
          </div>
        </div>

        {/* Raw JSON */}
        <details className="surface-card">
          <summary className="p-4 cursor-pointer text-[11px] font-bold text-ink-low uppercase tracking-wider select-none">
            Raw payload
          </summary>
          <pre className="px-4 pb-4 text-[11px] text-ink-low font-mono overflow-x-auto leading-relaxed">
            {JSON.stringify(item, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

// ── Main feed view ─────────────────────────────────────────────────────────

export function NotificationFeedView() {
  const [notifications, setNotifications] = useState<NotificationFeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [selected, setSelected] = useState<NotificationFeedItem | null>(null);

  // ── Poll with exponential backoff ────────────────────────────────────────
  const failCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const schedulePoll = useCallback((delay: number) => {
    timer.current = setTimeout(() => {
      fetchNotifications()
        .then((items) => {
          setNotifications(items);
          setStatus("ready");
          failCount.current = 0;
          schedulePoll(POLL_BASE); // success → reset to base interval
        })
        .catch(() => {
          failCount.current += 1;
          const next =
            failCount.current === 1 ? POLL_BACKOFF_1 : POLL_BACKOFF_2;
          schedulePoll(next); // backoff
        });
    }, delay);
  }, []);

  useEffect(() => {
    schedulePoll(POLL_BASE);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [schedulePoll]);

  // ── Manual refresh (full loading state) ──────────────────────────────────

  async function load() {
    setStatus("loading");
    setError(null);
    try {
      const items = await fetchNotifications();
      setNotifications(items);
      setStatus("ready");
      failCount.current = 0;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setStatus("error");
    }
  }

  useEffect(() => { load(); }, []);

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    return deliveryState(n) === filter;
  });

  const counts = {
    all: notifications.length,
    delivered: notifications.filter((n) => deliveryState(n) === "delivered").length,
    failed: notifications.filter((n) => deliveryState(n) === "failed").length,
    pending: notifications.filter((n) => deliveryState(n) === "pending").length,
  };

  // ── Detail mode ──────────────────────────────────────────────────────────

  if (selected) {
    return <NotificationDetail item={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          <Send size={14} className="text-accent" />
          <p className="text-sm font-semibold text-ink">Notification Feed</p>
          {status === "ready" && (
            <span className="flex items-center gap-1 text-[10px] text-ink-low">
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={status === "loading"}
          className="p-2 rounded-lg hover:bg-fill-strong active:bg-fill-strong transition min-w-[40px] min-h-[40px] flex items-center justify-center disabled:opacity-40"
          aria-label="Refresh feed"
        >
          <RefreshCw size={16} className={`text-ink-low ${status === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filter chips */}
      {status === "ready" && notifications.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-line shrink-0 overflow-x-auto">
          <FilterChip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip
            label="Delivered"
            count={counts.delivered}
            active={filter === "delivered"}
            onClick={() => setFilter("delivered")}
          />
          <FilterChip label="Failed" count={counts.failed} active={filter === "failed"} onClick={() => setFilter("failed")} />
          <FilterChip
            label="Pending"
            count={counts.pending}
            active={filter === "pending"}
            onClick={() => setFilter("pending")}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-border) transparent" }}>
        {status === "loading" && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-low">
            <div className="w-8 h-8 border-2 border-line border-t-accent rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading notifications…</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-urgent-dim flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={20} className="text-urgent" />
            </div>
            <p className="text-ink font-semibold text-sm mb-1">Dispatcher unreachable</p>
            <p className="text-ink-low text-xs mb-4">{error}</p>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 rounded-xl bg-fill text-ink-mid text-xs font-semibold border border-line active:bg-fill-strong transition min-h-[40px]"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ready" && filtered.length === 0 && notifications.length > 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center mx-auto mb-3">
              <Send size={20} className="text-ink-low" />
            </div>
            <p className="text-ink font-semibold text-sm mb-1">No {filter} notifications</p>
            <p className="text-ink-low text-xs">
              Try a different filter or wait for new dispatches.
            </p>
          </div>
        )}

        {status === "ready" && notifications.length === 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center mx-auto mb-3">
              <Send size={20} className="text-ink-low" />
            </div>
            <p className="text-ink font-semibold text-sm mb-1">No notifications yet</p>
            <p className="text-ink-low text-xs">
              Notifications dispatched to Slack will appear here.
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelected(n)}
                className="surface-card surface-card--interactive w-full text-left p-4 min-h-[72px]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <ChannelBadge channel={n.channel} />
                  <DeliveryBadge item={n} />
                </div>
                <p className="text-sm text-ink leading-relaxed mb-2 line-clamp-2">{n.text}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-ink-low font-medium">
                    {n.author === "plumbtrack" ? "🤖 PlumbTrack" : n.author}
                  </span>
                  <span className="text-[10px] text-ink-low">{timeAgo(n.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  Clock,
  FileText,
  Hash,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Wrench,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Smile,
  X,
} from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet, SheetActionCard } from "@/components/ui/BottomSheet";
import type { SlackMember, SlackMessage } from "@/types";

// ── Slack design tokens (dark theme, authentic density) ─────────────────────
const SIDEBAR = "#1A1D21";
const SIDEBAR_HOVER = "rgba(255,255,255,0.05)";
const ACTIVE = "#1164A3";
const PANE = "#1E1F22";
const TEXT = "#D1D2D3";
const MUTED = "#72767D";
const BORDER = "rgba(255,255,255,0.09)";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

function fmtDayDivider(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-extrabold text-white">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function MessageBody({ text }: { text: string }) {
  const lines = text.split(/\n/);
  let quoteBuffer: string[] = [];
  const blocks: { type: "quote" | "text"; content: string }[] = [];

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    blocks.push({ type: "quote", content: quoteBuffer.join("\n") });
    quoteBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith(">")) {
      quoteBuffer.push(line.slice(1).trim());
    } else {
      flushQuote();
      blocks.push({ type: "text", content: line });
    }
  }
  flushQuote();

  return (
    <>
      {blocks.map((b, i) =>
        b.type === "quote" ? (
          <span
            key={i}
            className="block border-l-2 pl-2.5 my-0.5 italic opacity-80 text-[13px]"
            style={{ borderColor: "#9C9EA3" }}
          >
            <RichText text={b.content} />
          </span>
        ) : (
          <span key={i}>
            <RichText text={b.content} />
          </span>
        ),
      )}
    </>
  );
}

function Avatar({ member, size = 28 }: { member: SlackMember; size?: number }) {
  return (
    <div
      className="rounded-md flex items-center justify-center font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, backgroundColor: member.color, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(member.name)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Channel Drawer (full-screen overlay)
// ═══════════════════════════════════════════════════════════════════════════

function ChannelDrawer({
  open,
  onClose,
  onOpenChannel,
}: {
  open: boolean;
  onClose: () => void;
  onOpenChannel: (id: string) => void;
}) {
  const { channels, members, messages, activeChannelId, activeTab, unreadByChannel, openChannel } =
    usePlumbTrackCtx();
  const [query, setQuery] = useState("");

  const filteredChannels = useMemo(
    () =>
      channels.filter(
        (c) => c.type === "channel" && c.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [channels, query],
  );
  const filteredDms = useMemo(
    () =>
      channels.filter(
        (c) =>
          c.type === "dm" &&
          (c.name.toLowerCase().includes(query.toLowerCase()) ||
            members.find((m) => m.name === c.name)?.name.toLowerCase().includes(query.toLowerCase())),
      ),
    [channels, members, query],
  );

  const memberById = useMemo(() => new Map(members.map((m) => [m.name, m])), [members]);

  // Focus search input on open
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  return (
    <>
      {/* Backdrop — full screen, over everything including header */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — slides from left, full height */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] flex flex-col transition-transform duration-200 ease-out shadow-2xl ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: SIDEBAR }}
        aria-label="Channels and direct messages"
        aria-hidden={!open}
      >
        {/* Workspace header */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b" style={{ borderColor: BORDER }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-[13px] bg-[#2B4A6B]">
            CSP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[15px] font-extrabold leading-tight truncate">
              Caulfield South Plumbing
            </p>
            <p className="text-[11px] font-medium" style={{ color: MUTED }}>
              4 members
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition text-slate-300"
            aria-label="Close channel list"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3">
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: MUTED }}
          >
            <Search size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to…"
              className="bg-transparent outline-none text-[14px] flex-1 placeholder:text-[#5C6066] text-[#E8E8E8]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Compose CTA */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenChannel("general");
          }}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-white font-bold text-[14px] transition active:scale-[0.98]"
          style={{ backgroundColor: ACTIVE }}
        >
          <MessageSquarePlus size={16} /> Compose message
        </button>

        {/* Channel list */}
        <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-0.5" aria-label="Channels and direct messages">
          <p className="px-2 pb-1 text-[12px] font-extrabold uppercase tracking-wide" style={{ color: "#5C6066" }}>
            Channels
          </p>
          {filteredChannels.map((c) => {
            const unread = unreadByChannel[c.id] ?? 0;
            const active = c.id === activeChannelId && activeTab === "messages";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onClose();
                  openChannel(c.id);
                }}
                className="w-full flex items-center gap-2 rounded-md px-2 py-[7px] text-left transition min-h-[36px]"
                style={{
                  backgroundColor: active ? ACTIVE : "transparent",
                  color: active ? "#FFFFFF" : "#C7CACD",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = SIDEBAR_HOVER;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Hash size={15} className="shrink-0 opacity-80" />
                <span className="flex-1 text-[15px] font-semibold truncate">{c.name}</span>
                {unread > 0 && (
                  <span
                    className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: ACTIVE, color: "#fff" }}
                  >
                    {unread}
                  </span>
                )}
              </button>
            );
          })}

          <p className="px-2 pt-4 pb-1 text-[12px] font-extrabold uppercase tracking-wide" style={{ color: "#5C6066" }}>
            Direct messages
          </p>
          {filteredDms.map((dm) => {
            const member = memberById.get(dm.name);
            const unread = unreadByChannel[dm.id] ?? 0;
            const active = dm.id === activeChannelId && activeTab === "messages";
            return (
              <button
                key={dm.id}
                type="button"
                onClick={() => {
                  onClose();
                  openChannel(dm.id);
                }}
                className="w-full flex items-center gap-2 rounded-md px-2 py-[7px] text-left transition min-h-[36px]"
                style={{
                  backgroundColor: active ? ACTIVE : "transparent",
                  color: active ? "#FFFFFF" : "#C7CACD",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = SIDEBAR_HOVER;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="relative shrink-0">
                  {member ? (
                    <Avatar member={member} size={22} />
                  ) : (
                    <span
                      className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: "#4A5568" }}
                    >
                      ?
                    </span>
                  )}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{
                      backgroundColor: member?.presence === "active" ? "#2EB67D" : "#9C9EA3",
                      borderColor: SIDEBAR,
                    }}
                  />
                </span>
                <span className="flex-1 text-[15px] font-semibold truncate">{dm.name}</span>
                {unread > 0 && (
                  <span
                    className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: ACTIVE, color: "#fff" }}
                  >
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
          {filteredChannels.length === 0 && filteredDms.length === 0 && (
            <p className="px-2 py-3 text-[13px]" style={{ color: MUTED }}>
              No matches for &quot;{query}&quot;
            </p>
          )}
        </nav>

        {/* Footer profile */}
        <div className="p-2 border-t shrink-0" style={{ borderColor: BORDER }}>
          <button
            type="button"
            onClick={() => { /* stays in messages */ }}
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/5 transition"
          >
            <Avatar member={members.find((m) => m.id === "tim")!} size={28} />
            <span className="flex-1 text-left leading-tight">
              <span className="block text-[14px] font-extrabold text-white">
                {members.find((m) => m.id === "tim")?.name}
              </span>
              <span className="block text-[11px]" style={{ color: MUTED }}>
                Active
              </span>
            </span>
            <MoreHorizontal size={16} style={{ color: MUTED }} />
          </button>
        </div>
      </aside>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Message row (tight Slack density)
// ═══════════════════════════════════════════════════════════════════════════

function MessageRow({
  message,
  member,
  onContextMenu,
}: {
  message: SlackMessage;
  member: SlackMember;
  onContextMenu: (message: SlackMessage) => void;
}) {
  const { toggleReaction } = usePlumbTrackCtx();
  const isBot = member.role === "bot";
  const pressTimer = useRef<number | null>(null);

  const startPress = () => {
    pressTimer.current = window.setTimeout(() => onContextMenu(message), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      className="group relative flex gap-2.5 px-4 py-1 rounded-md transition-colors select-none"
      style={{ cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.015)")}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        cancelPress();
      }}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelPress();
        onContextMenu(message);
      }}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar member={member} size={28} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15px] font-extrabold text-white leading-snug">{member.name}</span>
          {isBot && (
            <span
              className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-px rounded text-white"
              style={{ backgroundColor: ACTIVE }}
            >
              APP
            </span>
          )}
          <span className="text-[11px] mt-px" style={{ color: MUTED }}>
            {fmtTime(message.ts)}
          </span>
        </div>
        <p
          className="text-[15px] leading-[1.45] whitespace-pre-wrap break-words"
          style={{ color: TEXT }}
        >
          <MessageBody text={message.text} />
        </p>

        {/* Reactions — tighter spacing */}
        {Object.entries(message.reactions).some(([, n]) => (n ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(message.reactions)
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([emoji, n]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggleReaction(message.id, emoji)}
                  className="flex items-center gap-1 text-[12px] px-1.5 py-0 rounded-full border font-semibold transition hover:brightness-125"
                  style={{ borderColor: "rgba(255,255,255,0.15)", color: TEXT }}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  <span className="text-[11px]">{n}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Message list
// ═══════════════════════════════════════════════════════════════════════════

function MessageList({ onContextMenu }: { onContextMenu: (message: SlackMessage) => void }) {
  const { messages, channels, members, activeChannelId } = usePlumbTrackCtx();
  const bottomRef = useRef<HTMLDivElement>(null);

  const channelMessages = useMemo(
    () =>
      messages
        .filter((m) => m.channelId === activeChannelId)
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()),
    [messages, activeChannelId],
  );

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const channel = channels.find((c) => c.id === activeChannelId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [channelMessages.length, activeChannelId]);

  const lastRead = channel?.lastReadAt ? new Date(channel.lastReadAt).getTime() : 0;
  const firstUnreadIndex = channelMessages.findIndex(
    (m) => new Date(m.ts).getTime() > lastRead && m.authorId !== "tim",
  );

  let lastDay = "";

  return (
    <div className="flex-1 overflow-y-auto min-h-0" style={{ backgroundColor: PANE }}>
      {channelMessages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-[14px] text-center" style={{ color: MUTED }}>
            No messages yet in #{channel?.name}.
            <br />
            <span className="text-[13px]">Say hello 👋</span>
          </p>
        </div>
      ) : (
        channelMessages.map((m, idx) => {
          const day = fmtDayDivider(m.ts);
          const showDay = day !== lastDay;
          lastDay = day;
          const isFirstUnread = idx === firstUnreadIndex && firstUnreadIndex !== -1;
          return (
            <div key={m.id} className="relative">
              {showDay && (
                <div className="flex items-center gap-3 px-4 my-2">
                  <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide shrink-0" style={{ color: MUTED }}>
                    {day}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                </div>
              )}
              {isFirstUnread && (
                <div className="flex items-center gap-3 px-4 mb-1">
                  <div className="flex-1 h-px bg-[#E01E5A]" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#E01E5A] shrink-0">
                    New
                  </span>
                  <div className="flex-1 h-px bg-[#E01E5A]" />
                </div>
              )}
              <MessageRow
                message={m}
                member={memberById.get(m.authorId) ?? {
                  id: "unknown", name: "Unknown", role: "member", color: "#4A5568", presence: "away",
                }}
                onContextMenu={onContextMenu}
              />
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
      {/* Bottom spacer so last message isn't hidden behind composer */}
      <div className="h-4" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Quick updates sheet
// ═══════════════════════════════════════════════════════════════════════════

interface QuickUpdate {
  icon: typeof MapPin;
  title: string;
  hint: string;
  body: string;
}

const QUICK_UPDATES: QuickUpdate[] = [
  { icon: MapPin, title: "On site", hint: "GPS verified at job", body: "📍 On site at the job — GPS verified." },
  { icon: Check, title: "Job complete", hint: "Ready for sign-off", body: "✅ Job complete — ready for client sign-off." },
  { icon: Wrench, title: "Running late", hint: "Traffic / parts delay", body: "🔧 Running ~20 mins late — traffic on the way." },
  { icon: Clock, title: "Clocking off", hint: "Leaving site", body: "🕐 Clocking off site now." },
  { icon: FileText, title: "Quote sent", hint: "Awaiting approval", body: "🧾 Quote sent to the client for approval." },
  { icon: Clipboard, title: "Back at base", hint: "In the office", body: "📋 Back at base — call me if anything urgent." },
];

function QuickUpdateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeChannel, sendMessage } = usePlumbTrackCtx();
  const send = (u: QuickUpdate) => { sendMessage(u.body); onClose(); };
  return (
    <BottomSheet open={open} onClose={onClose} title="Quick updates" subtitle={`Tap to send to #${activeChannel?.name ?? "general"}`} label="Quick updates">
      <div className="grid grid-cols-2 gap-2.5">
        {QUICK_UPDATES.map((u) => (
          <SheetActionCard key={u.title} icon={u.icon} title={u.title} hint={u.hint} onClick={() => send(u)} />
        ))}
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Composer (compact Slack bar)
// ═══════════════════════════════════════════════════════════════════════════

function Composer({
  onOpenQuickUpdate,
  replyTo,
  onCancelReply,
}: {
  onOpenQuickUpdate: () => void;
  replyTo: { name: string; text: string } | null;
  onCancelReply: () => void;
}) {
  const { activeChannel, sendMessage } = usePlumbTrackCtx();
  const [text, setText] = useState("");

  const submit = useCallback(() => {
    if (!text.trim()) return;
    sendMessage(replyTo ? `> ${replyTo.text}\n\n${text}` : text);
    setText("");
    onCancelReply();
  }, [text, sendMessage, replyTo, onCancelReply]);

  return (
    <div
      className="shrink-0 px-3 pt-2 pb-[calc(0.75rem+var(--bottom-nav-clearance))]"
      style={{ backgroundColor: PANE }}
    >
      {replyTo && (
        <div
          className="flex items-center gap-2 rounded-t-lg px-3 py-1.5"
          style={{ backgroundColor: "#222529", borderTop: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }}
        >
          <span className="text-[12px] font-bold text-white truncate max-w-[80px]">Replying to {replyTo.name}</span>
          <span className="flex-1 text-[12px] text-slate-500 truncate">&quot;{replyTo.text}&quot;</span>
          <button type="button" onClick={onCancelReply} className="p-0.5 rounded hover:bg-white/10 text-slate-400 transition" aria-label="Cancel reply">
            <X size={13} />
          </button>
        </div>
      )}
      <div
        className={`flex items-center gap-1 rounded-lg px-2 min-h-[48px] ${replyTo ? "rounded-t-none" : ""}`}
        style={{ backgroundColor: "#222529", border: `1px solid ${BORDER}` }}
      >
        <button
          type="button"
          onClick={onOpenQuickUpdate}
          className="w-11 h-11 -ml-1 flex items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 haptic"
          aria-label="Quick updates"
        >
          <Plus size={18} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={`Message #${activeChannel?.name ?? "general"}`}
          aria-label={`Message #${activeChannel?.name ?? "general"}`}
          className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder:text-[#5C6066] py-1"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="w-11 h-11 -mr-1 flex items-center justify-center rounded-lg transition disabled:opacity-30 text-slate-300 hover:bg-white/10 haptic"
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Message context sheet (long-press / right-click)
// ═══════════════════════════════════════════════════════════════════════════

function MessageContextSheet({
  open,
  onClose,
  message,
  member,
  onReply,
}: {
  open: boolean;
  onClose: () => void;
  message: SlackMessage | null;
  member: SlackMember | null;
  onReply: (message: SlackMessage) => void;
}) {
  const { toggleReaction } = usePlumbTrackCtx();
  if (!message) return null;

  const action = (fn: () => void) => { fn(); onClose(); };

  return (
    <BottomSheet open={open} onClose={onClose} title={member?.name ?? "Message"} subtitle={message.text.slice(0, 60)} label="Message actions">
      <div className="grid grid-cols-2 gap-2.5">
        <SheetActionCard icon={MessageSquare} title="React" hint="Thumbs up" onClick={() => action(() => toggleReaction(message.id, "👍"))} />
        <SheetActionCard icon={MessageSquarePlus} title="Reply" hint="Quote in composer" onClick={() => action(() => onReply(message))} />
        <SheetActionCard icon={Clipboard} title="Copy text" hint="Copy to clipboard" onClick={() => action(() => { void navigator.clipboard?.writeText(message.text); })} />
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Channel info bar (thin row inside message area)
// ═══════════════════════════════════════════════════════════════════════════

function AvatarStack({ members, max = 4 }: { members: SlackMember[]; max?: number }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((m) => (
        <div key={m.id} className="-ml-1.5 first:ml-0 rounded-md" style={{ border: `2px solid ${PANE}` }}>
          <Avatar member={m} size={20} />
        </div>
      ))}
      {rest > 0 && (
        <div
          className="-ml-1.5 flex items-center justify-center rounded-md text-[9px] font-bold"
          style={{ width: 20, height: 20, backgroundColor: "rgba(255,255,255,0.08)", border: `2px solid ${PANE}`, color: MUTED }}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}

function ChannelInfoBar() {
  const { activeChannel, members } = usePlumbTrackCtx();
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0" style={{ backgroundColor: PANE, borderColor: BORDER }}>
      <Hash size={14} style={{ color: "#C7CACD" }} />
      <span className="text-white text-[15px] font-extrabold">{activeChannel?.name}</span>
      {activeChannel?.type === "channel" && (
        <>
          <span className="text-[12px] font-medium" style={{ color: MUTED }}>{members.length} members</span>
          <div className="flex-1" />
          <AvatarStack members={members} />
        </>
      )}
      {activeChannel?.type === "dm" && (
        <>
          <span className="text-[12px] font-medium" style={{ color: MUTED }}>direct message</span>
          <div className="flex-1" />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Exported: hook for parent to control drawer, + view component
// ═══════════════════════════════════════════════════════════════════════════

export function useMessagesDrawer() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return { drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false) };
}

export function MessagesView({
  drawerOpen,
  openDrawer,
  closeDrawer,
}: {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}) {
  const { activeChannel, members, openChannel } = usePlumbTrackCtx();
  const [quickOpen, setQuickOpen] = useState(false);
  const [contextMsg, setContextMsg] = useState<SlackMessage | null>(null);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const handleContextMenu = useCallback((m: SlackMessage) => { setContextMsg(m); setReplyTo(null); }, []);
  const handleReply = useCallback((m: SlackMessage) => {
    setContextMsg(null);
    setReplyTo({ name: memberById.get(m.authorId)?.name ?? "Unknown", text: m.text });
  }, [memberById]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Channel drawer — full-screen overlay */}
      <ChannelDrawer open={drawerOpen} onClose={closeDrawer} onOpenChannel={(id) => openChannel(id)} />

      {/* Sheets */}
      <QuickUpdateSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MessageContextSheet
        open={contextMsg !== null}
        onClose={() => setContextMsg(null)}
        message={contextMsg}
        member={contextMsg ? (memberById.get(contextMsg.authorId) ?? null) : null}
        onReply={handleReply}
      />

      {/* Channel info bar */}
      <ChannelInfoBar />

      {/* Messages */}
      <MessageList onContextMenu={handleContextMenu} />

      {/* Composer */}
      <Composer
        onOpenQuickUpdate={() => setQuickOpen(true)}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
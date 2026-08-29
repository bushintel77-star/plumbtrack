"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";

export function FieldChatSurface() {
  const { activeChannel, messages, members, sendMessage } = usePlumbTrackCtx();
  const [text, setText] = useState("");
  const channelMessages = useMemo(() => messages.filter(message => message.channelId === activeChannel?.id).slice(-12), [messages, activeChannel?.id]);
  const submit = () => { const value = text.trim(); if (!value) return; sendMessage(value); setText(""); };
  return <section className="surface-card p-3" aria-label="Field team chat" data-testid="field-chat-surface">
    <div className="mb-2 flex items-center gap-2"><MessageSquare size={16} className="text-accent"/><h2 className="text-sm font-bold">Team chat</h2><span className="text-xs text-ink-low">#{activeChannel?.name ?? "general"}</span></div>
    <div className="max-h-48 space-y-2 overflow-y-auto" aria-live="polite">{channelMessages.length === 0 ? <p className="text-xs text-ink-low">No updates in this channel yet.</p> : channelMessages.map(message => { const member = members.find(item => item.id === message.authorId); return <div key={message.id} className="rounded-lg bg-fill px-2.5 py-2 text-xs"><span className="font-bold text-ink">{member?.name ?? "Team"}</span><span className="ml-2 text-ink-low">{message.text}</span></div>; })}</div>
    <div className="mt-2 flex items-center gap-2"><input value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} aria-label="Message field team" placeholder="Send an update…" className="app-input min-h-[44px] flex-1 rounded-lg border px-3 text-sm text-ink"/><button type="button" onClick={submit} disabled={!text.trim()} aria-label="Send team message" className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-on-accent disabled:opacity-40"><Send size={16}/></button></div>
  </section>;
}

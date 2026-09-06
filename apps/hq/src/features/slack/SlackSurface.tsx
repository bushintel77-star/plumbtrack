"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Hash, Link2, Loader2, MessageSquare, Plug, RefreshCw } from "lucide-react"

import { slackApi, type SlackChannelSummary, type SlackRouteBinding, type SlackThreadMessage, type SlackWorkspaceStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * Slack rail surface (design §4.6, rebuilt in-stack).
 *
 * States, exactly as designed:
 *  - DISCONNECTED: Channels panel reads "Not connected yet.", the canvas is
 *    the Connect CTA, and the amber §8 banner says plainly that nothing here
 *    is live. The Connect button asks the API for Slack's real authorize URL;
 *    when the deployment has no Slack app configured the API answers 503 and
 *    the CTA says so honestly instead of pretending.
 *  - CONNECTED: Channels come from conversations.list, thread messages from
 *    conversations.history — Slack owns the messages; FieldLoop stores none.
 *    The Automation Routing pane is the live SlackChannelRoute table.
 *
 * The workspace access token never reaches this component — every Slack call
 * is proxied by the API.
 */

/** Canonical automation events; `job.status_urgent` is stored ahead of the
 *  server-side urgency signal existing (the job model has none yet). */
const EVENT_LABELS: Record<string, { label: string; note?: string }> = {
  "job.completed": { label: "job.completed" },
  "job.created_unassigned": { label: "job.created (unassigned)" },
  "job.status_urgent": { label: "job.status → urgent", note: "stored — urgency has no server-side signal yet" }
}

const SEVERITY_NOTE =
  "NOT CONNECTED — NOTHING IN THIS SURFACE IS LIVE YET"

export function SlackSurface() {
  const [status, setStatus] = useState<SlackWorkspaceStatus | null>(null)
  const [routes, setRoutes] = useState<SlackRouteBinding[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>(Object.keys(EVENT_LABELS))
  const [channels, setChannels] = useState<SlackChannelSummary[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SlackThreadMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Outcome of the OAuth round-trip, handed back by the API's callback
   *  redirect. Denial and failure are first-class states here — not happy
   *  path only (§9): a cancelled consent screen connects nothing, and the
   *  surface says so plainly. */
  const [connectOutcome, setConnectOutcome] = useState<"connected" | "denied" | "failed" | null>(null)

  const connected = status?.connected ?? false

  const loadWorkspace = useCallback(async () => {
    try {
      const workspace = await slackApi.workspace()
      setStatus(workspace)
      setRoutes(workspace.routes ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  // Landing back from Slack's OAuth redirect: the API bounced the installer's
  // browser here with ?slack_connect=connected|denied|failed. Read it, show
  // the matching honest status, and strip it from the URL so a refresh or a
  // shared link doesn't replay the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get("slack_connect")
    if (outcome !== "connected" && outcome !== "denied" && outcome !== "failed") return
    setConnectOutcome(outcome)
    params.delete("slack_connect")
    const rest = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`)
  }, [])

  // Connected: pull the real channel list (conversations.list proxy).
  useEffect(() => {
    if (!connected) {
      setChannels([])
      setActiveChannelId(null)
      setMessages([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const body = await slackApi.channels()
        if (alive) setChannels(body.channels)
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { alive = false }
  }, [connected])

  // Selected channel: pull the real thread (conversations.history proxy).
  useEffect(() => {
    if (!connected || !activeChannelId) {
      setMessages([])
      return
    }
    let alive = true
    setMessages([])
    void (async () => {
      try {
        const body = await slackApi.messages(activeChannelId)
        if (alive) setMessages(body.messages)
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { alive = false }
  }, [connected, activeChannelId])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      // Preferred path: Slack's real OAuth authorize URL.
      const body = await slackApi.oauthUrl()
      window.location.href = body.url
    } catch {
      setError("This deployment has no Slack OAuth app configured yet (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET). An admin can provision the bot token directly via POST /api/slack/workspace — until then, nothing is connected.")
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await slackApi.disconnect()
      await loadWorkspace()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const routeFor = useMemo(
    () => (eventType: string) => routes.find(route => route.eventType === eventType)?.channelId ?? "",
    [routes]
  )

  const saveRoute = async (eventType: string, channelId: string) => {
    setBusy(true)
    setError(null)
    try {
      if (channelId) {
        const saved = await slackApi.setRoute(eventType, channelId)
        setRoutes(current => [...current.filter(route => route.eventType !== eventType), saved])
      } else {
        await slackApi.disconnectRoute(eventType)
        setRoutes(current => current.filter(route => route.eventType !== eventType))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const activeChannel = channels.find(channel => channel.id === activeChannelId) ?? null

  return (
    <div className="flex min-w-0 flex-1 gap-3 py-3" data-testid="slack-surface">
      {/* ── Channels (left) ──────────────────────────────────────────────── */}
      <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel" aria-label="Slack channels">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="label-mono text-2xs text-ink-low">CHANNELS</span>
          {connected && (
            <button
              type="button"
              aria-label="Refresh channels"
              className="rounded p-1 text-ink-low hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400"
              onClick={() => { void loadWorkspace() }}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!connected && <p className="px-1.5 py-2 text-xs text-ink-low">Not connected yet.</p>}
          {connected && channels.length === 0 && (
            <p className="flex items-center gap-2 px-1.5 py-2 text-xs text-ink-low">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Loading channels…
            </p>
          )}
          {connected && channels.length > 0 && channels.map(channel => (
            <button
              key={channel.id}
              type="button"
              aria-current={activeChannelId === channel.id ? "true" : undefined}
              onClick={() => setActiveChannelId(channel.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                activeChannelId === channel.id ? "bg-chrome-wash" : "hover:bg-fill"
              )}
            >
              <Hash size={13} className="shrink-0 text-ink-low" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{channel.name}</span>
                {channel.purpose && <span className="block truncate text-[10px] text-ink-low">{channel.purpose}</span>}
              </span>
            </button>
          ))}
        </div>
        {connected && (
          <div className="border-t border-line p-2">
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-ink-low hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400"
              onClick={() => { void disconnect() }}
              disabled={busy}
            >
              Disconnect workspace{status?.teamName ? ` (${status.teamName})` : ""}
            </button>
          </div>
        )}
      </aside>

      {/* ── Canvas (center) ──────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel" aria-label="Slack">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <MessageSquare size={14} className="text-chrome-400" aria-hidden="true" />
          <span className="label-mono text-2xs text-ink-low">
            {connected ? `SLACK · ${status?.teamName ?? status?.teamId ?? "WORKSPACE"}` : "SLACK INTEGRATION"}
          </span>
          {connectOutcome && (
            <p
              data-testid={`slack-connect-${connectOutcome}`}
              role="status"
              className={cn(
                "ml-auto max-w-[60%] truncate label-mono text-2xs",
                connectOutcome === "connected" && "text-chrome-400",
                connectOutcome === "denied" && "text-ink-low",
                connectOutcome === "failed" && "text-pending"
              )}
            >
              {connectOutcome === "connected" && "SLACK WORKSPACE CONNECTED — LIVE DATA BELOW"}
              {connectOutcome === "denied" && "SLACK CONSENT DECLINED — NOTHING WAS CONNECTED"}
              {connectOutcome === "failed" && "SLACK CONNECT FAILED — TRY AGAIN, OR PROVISION A TOKEN DIRECTLY"}
            </p>
          )}
          {!connectOutcome && error && <span className="ml-auto max-w-[60%] truncate text-[11px] text-pending" role="status">{error}</span>}
        </div>

        {!connected && (
          <>
            {/* §8: the honesty banner stays up for as long as nothing here is real. */}
            <p className="shrink-0 bg-pending-wash px-3 py-1.5 text-center label-mono text-2xs text-pending" role="note">
              {SEVERITY_NOTE}
            </p>
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-chrome-wash text-chrome-400">
                <Hash size={22} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-bold text-ink">Connect FieldLoop to Slack</h2>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-mid">
                See job alerts and team messages without leaving Slack, or bring your team&apos;s
                Slack conversations into FieldLoop. FieldLoop already posts job events once
                connected — this adds two-way visibility inside the app.
              </p>
              <button
                type="button"
                data-testid="slack-connect"
                onClick={() => { void connect() }}
                disabled={busy}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-panel transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400 disabled:opacity-60"
              >
                <Hash size={15} aria-hidden="true" /> Connect to Slack
              </button>
              <p className="mt-3.5 max-w-sm text-[11px] leading-relaxed text-ink-low">
                Not connected yet — this button starts Slack&apos;s real OAuth flow once the backend is
                wired to a Slack app. Nothing is connected right now, and the workspace token will
                live server-side only.
              </p>
            </div>
          </>
        )}

        {connected && (
          <div className="flex min-h-0 flex-1 flex-col" data-testid="slack-thread">
            {!activeChannel && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-low">
                <Link2 size={22} aria-hidden="true" />
                <p className="text-[13px]">Pick a channel to read its live Slack history.</p>
              </div>
            )}
            {activeChannel && (
              <>
                <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                  <Hash size={13} className="text-ink-low" aria-hidden="true" />
                  <span className="text-sm font-bold text-ink">{activeChannel.name}</span>
                  <span className="label-mono text-2xs text-ink-low">READ FROM SLACK&apos;S API — NOT STORED IN FIELDLOOP</span>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {messages.length === 0 && <p className="text-xs text-ink-low">No messages — this channel is quiet (or the bot can&apos;t read it).</p>}
                  {messages.map(message => (
                    <div key={message.ts} className={cn("max-w-[72%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed", message.fromBot ? "border-chrome-400/60 bg-chrome-wash" : "border-line bg-fill")}>
                      <p className="mb-0.5 text-[11px] font-semibold text-ink-mid">
                        {message.fromBot ? "FieldLoop automation" : message.username ?? message.user ?? "Member"}
                      </p>
                      <p className="whitespace-pre-wrap text-ink">{message.text}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line px-4 py-2">
                  <input
                    type="text"
                    disabled
                    aria-label="Posting is read-only in this surface"
                    placeholder="Read-only — posting to Slack happens from the field app and automations"
                    className="w-full cursor-not-allowed rounded-lg border border-line bg-fill px-3 py-2 text-xs text-ink-low placeholder:text-ink-low"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Automation Routing (right) ───────────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel" aria-label="Automation routing">
        <div className="border-b border-line px-3 py-2.5">
          <span className="label-mono text-2xs text-ink-low">AUTOMATION ROUTING</span>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-low">
            Which backend events post to which channel — this mapping is the live
            SlackChannelRoute table{connected ? "" : ", shown empty until a workspace connects"}.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {eventTypes.map(eventType => {
            const meta = EVENT_LABELS[eventType] ?? { label: eventType }
            const current = routeFor(eventType)
            return (
              <div key={eventType} className="border-b border-line py-2 last:border-b-0" data-testid={`slack-route-${eventType}`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="label-mono flex-1 truncate text-ink-mid">{meta.label}</span>
                  <span className="text-ink-low" aria-hidden="true">→</span>
                  <span className="label-mono truncate font-semibold text-chrome-400">{current ? `#${current}` : "—"}</span>
                </div>
                {connected ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <select
                      aria-label={`Route ${meta.label} to channel`}
                      value={current}
                      disabled={busy}
                      onChange={event => { void saveRoute(eventType, event.target.value) }}
                      className="min-w-0 flex-1 rounded-md border border-line bg-fill px-2 py-1 text-[11px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400"
                    >
                      <option value="">— none —</option>
                      {channels.map(channel => (
                        <option key={channel.id} value={channel.id}>#{channel.name}</option>
                      ))}
                    </select>
                    <Plug size={12} className="shrink-0 text-ink-low" aria-hidden="true" />
                  </div>
                ) : null}
                {meta.note && <p className="mt-1 text-[10px] leading-snug text-ink-low">{meta.note}</p>}
              </div>
            )
          })}
          {!connected && (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-low">
              Connect a workspace to see this reflected live.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

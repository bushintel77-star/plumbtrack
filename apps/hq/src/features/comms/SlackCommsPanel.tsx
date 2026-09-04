"use client"

import { useMemo, useState } from "react"
import {
  Archive,
  Check,
  Clock,
  Hash,
  MessageSquare,
  Send,
  Slack,
  X
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { rankCrews } from "@/lib/assignment"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { JobStatus, SlackDispatchCard } from "@/types"
import { performAssignment } from "@/features/board/actions"
import { toast } from "@/hooks/use-toast"

const KIND_STYLES: Record<
  SlackDispatchCard["kind"],
  { accent: string; label: string }
> = {
  "new-job": { accent: "bg-urgent", label: "NEW TASK" },
  claimed: { accent: "bg-chrome-400", label: "CLAIMED" },
  "en-route": { accent: "bg-chrome-400", label: "EN ROUTE" },
  "on-site": { accent: "bg-active", label: "ON SITE" },
  complete: { accent: "bg-complete", label: "COMPLETE" }
}

function DispatchCard({ card }: { card: SlackDispatchCard }) {
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()
  const style = KIND_STYLES[card.kind]
  const job = jobs.find(j => j.id === card.jobId)

  const accept = (): void => {
    if (!job) return
    const [best] = rankCrews(job, technicians, jobs)
    if (!best || !best.qualified) {
      toast({
        variant: "destructive",
        title: "No crew can accept",
        description: "No qualified, available technician for this task."
      })
      return
    }
    void performAssignment(job.id, best.tech.id, best.firstFreeBlock)
  }

  const canAccept =
    card.kind === "new-job" && !card.actionsDisabled && job?.status === "unassigned"

  return (
    <div
      data-testid={`slack-card-${card.jobId}`}
      className={cn(
        "panel rounded-md border border-line p-2.5",
        card.kind === "en-route" && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 h-8 w-1 shrink-0 rounded-full", style.accent)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="label-mono text-2xs text-ink-low">{style.label}</span>
            <span className="truncate text-xs font-bold">{card.title}</span>
          </div>
          <div className="label-mono truncate text-2xs text-ink-low">{card.client}</div>
          <p className="mt-1 text-2xs leading-snug text-ink-mid">{card.body}</p>
          {card.kind === "en-route" && card.etaMinutes != null && (
            <span
              data-testid={`slack-eta-${card.jobId}`}
              className="label-mono tnum mt-1 inline-flex items-center gap-1 rounded-sm bg-chrome-wash px-1.5 py-0.5 text-2xs text-chrome-600"
            >
              <Clock className="h-3 w-3" />
              ETA ~{card.etaMinutes}M
            </span>
          )}
          {card.kind === "claimed" && card.claimedBy && (
            <span
              data-testid={`slack-claimed-${card.jobId}`}
              className="label-mono mt-1 inline-flex items-center gap-1 rounded-sm bg-chrome-wash px-1.5 py-0.5 text-2xs text-chrome-600"
            >
              <Check className="h-3 w-3" />
              CLAIMED BY {card.claimedBy.toUpperCase()}
            </span>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            {canAccept ? (
              <Button
                size="sm"
                data-testid={`slack-accept-${card.jobId}`}
                className="btn-primary label-mono h-6 px-2.5 text-2xs"
                onClick={accept}
              >
                ACCEPT TASK
              </Button>
            ) : (
              card.kind === "new-job" && (
                <span className="label-mono text-2xs text-ink-low">
                  Action closed — status moved on
                </span>
              )
            )}
            {card.kind === "complete" && (
              <span className="label-mono inline-flex items-center gap-1 text-2xs text-complete">
                <Archive className="h-3 w-3" />
                CHANNEL ARCHIVED
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_COMMANDS: JobStatus[] = [
  "unassigned",
  "scheduled",
  "en_route",
  "active",
  "complete",
  "delayed"
]

/**
 * Slack bridge comms drawer (research §Slack FSM integration): the FSM's
 * outbound surface — Block-Kit-style dispatch cards in #dispatch-queue with
 * interactive Accept buttons — plus the inbound surface: /dispatch-status
 * slash commands mutate the board from the chat line, exactly like a
 * technician updating availability from their phone.
 */
export function SlackCommsPanel() {
  const open = useBoardStore(s => s.commsOpen)
  const setOpen = useBoardStore(s => s.setCommsOpen)
  const channels = useBoardStore(s => s.channels)
  const activeChannelId = useBoardStore(s => s.activeChannelId)
  const setActiveChannel = useBoardStore(s => s.setActiveChannel)
  const postMessage = useBoardStore(s => s.postMessage)
  const setJobStatus = useBoardStore(s => s.setJobStatus)
  const slackFeed = useBoardStore(s => s.slackFeed)
  const jobs = useJobsList()
  const [draft, setDraft] = useState("")
  const [activeTab, setActiveTab] = useState<"cards" | "messages">("cards")

  const dispatchQueue = channels.find(c => c.id === "general")
  const jobChannels = useMemo(
    () => channels.filter(c => c.id.startsWith("job-")),
    [channels]
  )
  const activeChannel =
    jobChannels.find(c => c.id === activeChannelId) ?? jobChannels[0] ?? null

  const runCommand = (raw: string): boolean => {
    const text = raw.trim()
    if (text === "/help") {
      postMessage("general", "/dispatch-status {jobId} {status} — update a job (e.g. /dispatch-status j-1002 en_route)")
      return true
    }
    const match = /^\/dispatch-status\s+(\S+)\s+(\S+)$/.exec(text)
    if (!match) return false
    const [, jobId, statusWord] = match
    if (!STATUS_COMMANDS.includes(statusWord as JobStatus)) {
      toast({
        variant: "destructive",
        title: "Unknown status",
        description: `Try one of: ${STATUS_COMMANDS.join(", ")}.`
      })
      return true
    }
    const job = jobs.find(j => j.id === jobId)
    if (!job) {
      toast({ variant: "destructive", title: "Unknown job", description: `No job “${jobId}”.` })
      return true
    }
    setJobStatus(jobId, statusWord as JobStatus)
    postMessage("general", `✓ ${job.title} → ${statusWord.replace("_", " ")}`)
    return true
  }

  const send = (): void => {
    const text = draft.trim()
    if (!text) return
    if (runCommand(text)) {
      setDraft("")
      return
    }
    if (activeChannel) {
      postMessage(activeChannel.id, text)
    } else {
      postMessage("general", text)
    }
    setDraft("")
  }

  const unreadCards = slackFeed.filter(c => c.kind === "new-job").length
  if (!open) return null

  return (
    <aside
      data-testid="comms-panel"
        className="panel-strong fixed inset-y-0 right-0 z-50 flex w-[360px] flex-col border-l border-line shadow-[var(--chassis-shadow)]"
      aria-label="Slack dispatch comms"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-chrome-wash text-chrome-400">
            <Slack className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-bold">#dispatch-queue</div>
            <div className="label-mono text-2xs text-ink-low">
              FSM BRIDGE · {slackFeed.length} CARDS
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close comms"
          data-testid="comms-close"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        className="flex items-center gap-1 border-b border-line px-3 py-1.5"
        role="group"
        aria-label="Comms surfaces"
      >
        {(
          [
            { id: "cards", label: "DISPATCH CARDS", icon: MessageSquare, badge: unreadCards },
            { id: "messages", label: "CHANNELS", icon: Hash, badge: 0 }
          ] as const
        ).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              aria-pressed={activeTab === tab.id}
              data-testid={`comms-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "label-mono flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-2xs font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-chrome-wash text-chrome-600"
                  : "text-ink-mid hover:text-ink"
              )}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
              {tab.badge > 0 && (
                <span className="tnum rounded-full bg-urgent px-1.5 text-[10px] font-bold text-on-accent">
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === "cards" ? (
        <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {slackFeed.length === 0 && (
            <p className="py-8 text-center text-2xs text-ink-low">
              No dispatch cards yet — board transitions post here automatically.
            </p>
          )}
          {slackFeed.map(card => (
            <DispatchCard key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          <button
            data-testid="comms-channel-general"
            onClick={() => {
              setActiveChannel("general")
              setActiveTab("messages")
            }}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-fill"
          >
            <span className="label-mono text-ink-mid">#general · team chatter</span>
            {dispatchQueue && dispatchQueue.unread > 0 && (
              <span className="tnum rounded-full bg-urgent px-1.5 text-[10px] font-bold text-on-accent">
                {dispatchQueue.unread}
              </span>
            )}
          </button>
          <div className="label-mono mt-2 px-2 text-2xs text-ink-low">
            INCIDENT CHANNELS
          </div>
          {jobChannels.length === 0 && (
            <p className="px-2 py-2 text-2xs text-ink-low">
              None open — a channel spawns when a tech clocks on site.
            </p>
          )}
          {jobChannels.map(channel => (
            <div
              key={channel.id}
              data-testid={`comms-channel-${channel.id}`}
              className={cn(
                "rounded-md",
                activeChannel?.id === channel.id && "bg-chrome-wash"
              )}
            >
              <button
                onClick={() => setActiveChannel(channel.id)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-fill"
              >
                <span
                  className={cn(
                    "label-mono text-ink-mid",
                    channel.archived && "line-through opacity-60"
                  )}
                >
                  #{channel.name}
                </span>
                {channel.archived ? (
                  <Badge className="label-mono h-4 rounded-sm bg-recess px-1 text-2xs text-ink-low hover:bg-recess">
                    ARCHIVED
                  </Badge>
                ) : (
                  channel.unread > 0 && (
                    <span className="tnum rounded-full bg-urgent px-1.5 text-[10px] font-bold text-on-accent">
                      {channel.unread}
                    </span>
                  )
                )}
              </button>
              {activeChannel?.id === channel.id && (
                <div className="space-y-1.5 px-2 pb-2">
                  {channel.messages.map(message => (
                    <div key={message.id} className="text-2xs leading-snug">
                      <span className="label-mono text-chrome-600">{message.author}</span>{" "}
                      <span className="text-ink-mid">{message.body}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-line p-2.5">
        <div className="flex items-center gap-1.5">
          <input
            data-testid="comms-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") send()
            }}
            placeholder="/dispatch-status j-1002 en_route · /help"
            className="label-mono h-8 min-w-0 flex-1 rounded-md border border-line bg-recess px-2.5 text-2xs text-ink placeholder:text-ink-low focus:border-chrome-400 focus:outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-chrome-400"
            aria-label="Send"
            data-testid="comms-send"
            onClick={send}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  )
}

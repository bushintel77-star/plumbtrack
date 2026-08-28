import { Hash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useDispatchStore } from '@/store/dispatchStore'

export function ChannelSidebar(): JSX.Element {
  const channels = useDispatchStore((s) => s.channels)
  const activeChannelId = useDispatchStore((s) => s.activeChannelId)
  const setActiveChannel = useDispatchStore((s) => s.setActiveChannel)
  const active = channels.find((c) => c.id === activeChannelId) ?? channels[0]

  return (
    <section className="dispatch-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          HQ Comms
        </h2>
      </div>

      <nav className="space-y-0.5 p-2" aria-label="Channels">
        {channels.map((channel) => (
          <button
            key={channel.id}
            data-testid={`channel-${channel.id}`}
            onClick={() => setActiveChannel(channel.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
              channel.id === activeChannelId
                ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            )}
          >
            <Hash className="h-3.5 w-3.5 shrink-0 text-blue-400/80" />
            <span className="flex-1 truncate">{channel.name}</span>
            {channel.unread > 0 && (
              <Badge className="tnum h-4 min-w-4 shrink-0 rounded-full bg-primary px-1 text-[10px]">
                {channel.unread}
              </Badge>
            )}
          </button>
        ))}
      </nav>

      <ScrollArea className="min-h-0 flex-1 border-t border-white/[0.06]">
        <div data-testid="channel-messages" className="space-y-3 p-3">
          {active.messages.map((message) => (
            <div key={message.id} className="text-[12px] leading-relaxed">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-foreground">{message.author}</span>
                <span className="tnum text-[10px] text-muted-foreground">
                  {message.minutesAgo === 0 ? 'now' : `${message.minutesAgo}m ago`}
                </span>
              </div>
              <p className="text-muted-foreground">{message.body}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  )
}

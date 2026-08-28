import { ChannelSidebar } from './ChannelSidebar'
import { UnassignedQueue } from './UnassignedQueue'

export function LeftPanel({ onOpenDetails }: { onOpenDetails?: (jobId: string) => void }): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <UnassignedQueue onOpenDetails={onOpenDetails} />
      <ChannelSidebar />
    </div>
  )
}

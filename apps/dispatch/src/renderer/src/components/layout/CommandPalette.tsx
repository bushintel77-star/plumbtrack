import { Hash, Wrench } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDispatchStore } from '@/store/dispatchStore'

export function CommandPalette(): JSX.Element {
  const paletteOpen = useDispatchStore((s) => s.paletteOpen)
  const setPaletteOpen = useDispatchStore((s) => s.setPaletteOpen)
  const jobs = useDispatchStore((s) => s.jobs)
  const technicians = useDispatchStore((s) => s.technicians)
  const channels = useDispatchStore((s) => s.channels)
  const selectJob = useDispatchStore((s) => s.selectJob)
  const setActiveChannel = useDispatchStore((s) => s.setActiveChannel)

  const close = (): void => setPaletteOpen(false)

  return (
    <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
      <SheetContent
        side="top"
        className="glass-strong inset-x-0 mx-auto mt-[12vh] w-[min(560px,92vw)] rounded-xl border-white/10"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Command palette</SheetTitle>
          <SheetDescription>Jump to jobs and channels across the command center</SheetDescription>
        </SheetHeader>
        <Command className="rounded-lg">
          <CommandInput data-testid="palette-input" placeholder="Type a job, technician or channel…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup heading="Jobs">
              {jobs.map((job) => {
                const tech = technicians.find((t) => t.id === job.techId)
                return (
                  <CommandItem
                    key={job.id}
                    value={`${job.title} ${job.id} ${job.client} ${tech?.name ?? ''}`}
                    onSelect={() => {
                      selectJob(job.id)
                      close()
                    }}
                  >
                    <Wrench className="mr-2 h-3.5 w-3.5 text-blue-400/80" />
                    <span className="flex-1">{job.title}</span>
                    <span className="tnum text-[10px] text-muted-foreground">
                      {job.id.toUpperCase()} · {tech ? tech.name.split(' ')[0] : 'UNASSIGNED'}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandGroup heading="Channels">
              {channels.map((channel) => (
                <CommandItem
                  key={channel.id}
                  value={`channel ${channel.name}`}
                  onSelect={() => {
                    setActiveChannel(channel.id)
                    close()
                  }}
                >
                  <Hash className="mr-2 h-3.5 w-3.5 text-blue-400/80" />
                  {channel.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </SheetContent>
    </Sheet>
  )
}

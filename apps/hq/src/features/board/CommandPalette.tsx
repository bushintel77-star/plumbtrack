"use client"

import { Wrench } from "lucide-react"
import { useQueryState, parseAsString } from "nuqs"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

export function CommandPalette() {
  const paletteOpen = useBoardStore(s => s.paletteOpen)
  const setPaletteOpen = useBoardStore(s => s.setPaletteOpen)
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const [, setModule] = useQueryState("module", parseAsString.withDefault("dashboard"))

  const close = (): void => setPaletteOpen(false)

  return (
    <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
      <SheetContent
        side="top"
        className="panel-strong inset-x-0 mx-auto mt-[12vh] w-[min(560px,92vw)] rounded-xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Command palette</SheetTitle>
          <SheetDescription>
            Jump to jobs and channels across the command center
          </SheetDescription>
        </SheetHeader>
        <Command className="rounded-lg">
          <CommandInput
            data-testid="palette-input"
            placeholder="Type a job, technician or channel…"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup heading="Jobs">
              {jobs.map(job => {
                const tech = technicians.find(t => t.id === job.techId)
                return (
                  <CommandItem
                    key={job.id}
                    value={`${job.title} ${job.id} ${job.client} ${tech?.name ?? ""}`}
                    onSelect={() => {
                      void setModule("dispatch")
                      openDetails(job.id)
                      close()
                    }}
                  >
                    <Wrench className="mr-2 h-3.5 w-3.5 text-chrome-400" />
                    <span className="flex-1">{job.title}</span>
                    <span className="label-mono tnum text-2xs text-ink-low">
                      {job.id.toUpperCase()} ·{" "}
                      {tech ? tech.name.split(" ")[0] : "UNASSIGNED"}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </SheetContent>
    </Sheet>
  )
}

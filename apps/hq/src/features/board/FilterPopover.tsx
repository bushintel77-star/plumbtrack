"use client"

import { useQueryStates, parseAsArrayOf, parseAsString, parseAsBoolean } from "nuqs"
import { SlidersHorizontal } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { JOB_TYPES, REGIONS, ROLES, SKILLS } from "@/types"
import { countActiveFilters } from "./filters"

/**
 * Global filter popover (research §Advanced Visual Noise Reduction):
 * accordion categories of multi-select dimensions, every change bound to
 * URL query params so any filtered view is bookmarkable and shareable.
 * Team + availability dimensions filter the technician axis itself.
 */
export function FilterPopover() {
  const [filters, setFilters] = useQueryStates({
    status: parseAsArrayOf(parseAsString).withDefault([]),
    priority: parseAsArrayOf(parseAsString).withDefault([]),
    skill: parseAsArrayOf(parseAsString).withDefault([]),
    region: parseAsArrayOf(parseAsString).withDefault([]),
    jobType: parseAsArrayOf(parseAsString).withDefault([]),
    team: parseAsArrayOf(parseAsString).withDefault([]),
    availableOnly: parseAsBoolean.withDefault(false)
  })
  const activeCount = countActiveFilters(filters)

  const toggle = (key: keyof typeof filters, value: string): void => {
    const current = filters[key] as string[]
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    void setFilters({ [key]: next })
  }

  const checkRow = (
    key: "status" | "priority" | "skill" | "region" | "jobType" | "team",
    value: string,
    label: string
  ): React.ReactNode => (
    <label
      data-testid={`chk-${key}-${value}`}
      className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-xs text-ink-mid transition-colors hover:bg-fill hover:text-ink"
    >
      <Checkbox
        checked={(filters[key] as string[]).includes(value)}
        onCheckedChange={() => toggle(key, value)}
      />
      {label}
    </label>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="filter-trigger"
          className={cn(
            "label-mono h-8 gap-1.5 border-line bg-recess px-2.5 text-2xs",
            activeCount > 0
              ? "border-chrome-600 text-chrome-600"
              : "text-ink-mid hover:text-ink"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          FILTER
          {activeCount > 0 && (
            <span
              data-testid="filter-count"
              className="tnum ml-0.5 rounded-full bg-chrome-600 px-1.5 text-[10px] font-bold text-on-accent"
            >
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="panel-strong w-80 rounded-2xl border border-line/80 bg-recess/95 p-2.5 shadow-[var(--chassis-shadow)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
        <div className="border-b border-line/80 px-2 pb-2 pt-1"><div className="text-sm font-semibold text-ink">Filter the board</div><div className="mt-0.5 text-2xs text-ink-low">Focus the shift without leaving the planner</div></div>
        <Accordion type="multiple" defaultValue={["status"]}>
          <AccordionItem value="status">
            <AccordionTrigger>STATUS</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {["unassigned", "scheduled", "en_route", "active", "complete", "delayed"].map(
                v => checkRow("status", v, v.replace("_", " "))
              )}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="team">
            <AccordionTrigger>TEAM / ROLE</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {ROLES.map(role => checkRow("team", role, role))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="skills">
            <AccordionTrigger>SKILLS</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {SKILLS.map(skill => checkRow("skill", skill, skill))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="region">
            <AccordionTrigger>REGION</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {REGIONS.map(region => checkRow("region", region, region))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="type">
            <AccordionTrigger>JOB TYPE</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {JOB_TYPES.map(type => checkRow("jobType", type, type))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="priority">
            <AccordionTrigger>PRIORITY</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-x-2">
              {["emergency", "high", "normal"].map(v => checkRow("priority", v, v))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="availability">
            <AccordionTrigger>AVAILABILITY</AccordionTrigger>
            <AccordionContent>
              <label
                data-testid="chk-availableOnly-true"
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-xs text-ink-mid transition-colors hover:bg-fill hover:text-ink"
              >
                <Checkbox
                  checked={filters.availableOnly}
                  onCheckedChange={checked =>
                    void setFilters({ availableOnly: checked === true })
                  }
                />
                Available only (hide approved leave)
              </label>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </PopoverContent>
    </Popover>
  )
}

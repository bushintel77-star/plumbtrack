"use client"

import { ChipChoice, Question, TextField } from "../primitives"
import type { AreaAnswers } from "../types"

const RADIUS_OPTIONS = [
  { value: "5", label: "5 km" },
  { value: "10", label: "10 km" },
  { value: "20", label: "20 km", recommended: true },
  { value: "40", label: "40 km" },
  { value: "metro", label: "Metro-wide" }
] as const

const HOURS_OPTIONS = [
  { value: "mon_fri_7_4", label: "Mon–Fri, 7am–4pm", recommended: true },
  { value: "mon_fri_7_5", label: "Mon–Fri, 7am–5pm" },
  { value: "mon_sat_7_4", label: "Mon–Sat, 7am–4pm" },
  { value: "custom", label: "Custom" }
] as const

export function AreaStep({
  value,
  onChange,
  errors
}: {
  value: Partial<AreaAnswers>
  onChange: (patch: Partial<AreaAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question label="How far do you travel for a job?" hint="Used to flag jobs outside your usual patch — it never blocks a booking.">
        <ChipChoice label="Service radius" options={RADIUS_OPTIONS} value={value.radiusKm} onChange={next => onChange({ radiusKm: next })} />
      </Question>

      <Question label="What are your usual hours?" hint="Sets the working hours shown on the dispatch board and used for On my way and booking messages.">
        <ChipChoice label="Hours" options={HOURS_OPTIONS} value={value.hours} onChange={next => onChange({ hours: next })} />
        {value.hours === "custom" && (
          <div className="mt-3">
            <TextField
              label="Describe your hours"
              value={value.customHours ?? ""}
              onChange={next => onChange({ customHours: next })}
              placeholder="e.g. Tue–Sat, 6am–2pm"
              width="medium"
            />
          </div>
        )}
      </Question>
    </>
  )
}

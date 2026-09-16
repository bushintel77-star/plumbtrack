"use client"

import { ChipChoice, ChipMulti, Question } from "../primitives"
import { TRADE_LABELS, type ServicesAnswers } from "../types"

const TRADE_OPTIONS = (Object.keys(TRADE_LABELS) as ServicesAnswers["trades"]).map(value => ({
  value,
  label: TRADE_LABELS[value]
}))

const EMERGENCY_OPTIONS = [
  { value: "none", label: "No emergency work" },
  { value: "business_hours", label: "Business hours only" },
  { value: "evenings", label: "Evenings too" },
  { value: "24_7", label: "24/7" }
] as const

export function ServicesStep({
  value,
  onChange,
  errors
}: {
  value: Partial<ServicesAnswers>
  onChange: (patch: Partial<ServicesAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question
        label="What work do you take on?"
        hint="This sets up the job types, checklists and compliance forms your team sees — pick everything that applies."
        error={errors.trades}
      >
        <ChipMulti label="Types of work" options={TRADE_OPTIONS} values={value.trades ?? []} onChange={next => onChange({ trades: next })} />
      </Question>

      <Question label="Do you take emergency callouts?" hint="Emergency jobs jump to the top of the dispatch board automatically.">
        <ChipChoice
          label="Emergency callouts"
          options={EMERGENCY_OPTIONS}
          value={value.emergency}
          onChange={next => onChange({ emergency: next })}
        />
      </Question>
    </>
  )
}

"use client"

import { ChipChoice, ChipMulti, Question, Stepper } from "../primitives"
import type { TeamAnswers } from "../types"

const SIZE_OPTIONS = [
  { value: "just_me", label: "Just me" },
  { value: "2_5", label: "2–5" },
  { value: "6_10", label: "6–10" },
  { value: "11_20", label: "11–20" },
  { value: "21_50", label: "21–50" },
  { value: "50_plus", label: "50+" }
] as const

const ROLE_OPTIONS = [
  { value: "plumbers", label: "Licensed plumbers" },
  { value: "gasfitters", label: "Gasfitters" },
  { value: "apprentices", label: "Apprentices" },
  { value: "office", label: "Office / dispatch" },
  { value: "estimators", label: "Estimators" },
  { value: "managers", label: "Managers" },
  { value: "subcontractors", label: "Subcontractors" }
] as const

export function TeamStep({
  value,
  onChange,
  errors
}: {
  value: Partial<TeamAnswers>
  onChange: (patch: Partial<TeamAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question
        label="How many people are on the team?"
        hint="This decides how much detail the dispatch board and daily planning show — a one-person board looks different from a twenty-person one."
        error={errors.teamSize}
      >
        <ChipChoice label="Team size" options={SIZE_OPTIONS} value={value.teamSize} onChange={next => onChange({ teamSize: next })} />
      </Question>

      <Question label="Who's on the team?" hint="Pick every role you have today — you can add people under each one later.">
        <ChipMulti label="Roles" options={ROLE_OPTIONS} values={value.roles ?? []} onChange={next => onChange({ roles: next })} />
      </Question>

      <Question label="How many vans or vehicles?" hint="One row per van on the dispatch board and the map.">
        <Stepper
          label="Number of vans"
          value={value.vans ?? 1}
          onChange={next => onChange({ vans: next })}
          min={0}
          max={100}
        />
      </Question>
    </>
  )
}

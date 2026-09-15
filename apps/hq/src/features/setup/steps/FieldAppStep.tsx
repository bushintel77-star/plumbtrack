"use client"

import { ChipChoice, Question } from "../primitives"
import type { FieldAppAnswers } from "../types"

const TRACKING_OPTIONS = [
  { value: "shift", label: "Shift tracking", note: "position shared while clocked on", recommended: true },
  { value: "clock_points", label: "Clock points only", note: "captured only at clock-in and clock-out" }
] as const

const PHOTO_OPTIONS = [
  { value: "standard", label: "Standard", note: "faster uploads, smaller files", recommended: true },
  { value: "high", label: "High quality", note: "larger files, uses more mobile data" }
] as const

export function FieldAppStep({
  value,
  onChange,
  errors
}: {
  value: Partial<FieldAppAnswers>
  onChange: (patch: Partial<FieldAppAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question
        label="How should location tracking work by default?"
        hint="Every technician can change this for themselves on their phone — this only sets what they start with. FieldLoop never tracks location outside a shift, either way."
      >
        <ChipChoice label="Default tracking mode" options={TRACKING_OPTIONS} value={value.trackingDefault} onChange={next => onChange({ trackingDefault: next })} />
      </Question>

      <Question label="Photo quality on site" hint="Applies to photos captured in the field app.">
        <ChipChoice label="Photo quality" options={PHOTO_OPTIONS} value={value.photoQuality} onChange={next => onChange({ photoQuality: next })} />
      </Question>
    </>
  )
}

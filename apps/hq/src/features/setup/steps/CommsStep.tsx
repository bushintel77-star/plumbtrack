"use client"

import { ChipChoice, ChipMulti, Question } from "../primitives"
import type { CommsAnswers } from "../types"

const MESSAGE_OPTIONS = [
  { value: "booking_confirmation", label: "Booking confirmation" },
  { value: "on_my_way", label: "On my way" },
  { value: "running_late", label: "Running late" },
  { value: "job_summary", label: "Job complete summary" },
  { value: "invoice", label: "Invoice by email/SMS" },
  { value: "review_request", label: "Review request" }
] as const

const QUIET_OPTIONS = [
  { value: "none", label: "No restriction" },
  { value: "after_6pm", label: "Nothing after 6pm" },
  { value: "after_8pm", label: "Nothing after 8pm", recommended: true }
] as const

export function CommsStep({
  value,
  onChange,
  errors
}: {
  value: Partial<CommsAnswers>
  onChange: (patch: Partial<CommsAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question
        label="Which messages should customers get automatically?"
        hint="These send by SMS once Twilio is connected on the Integrations step — until then they're queued, not sent."
      >
        <ChipMulti
          label="Customer messages"
          options={MESSAGE_OPTIONS}
          values={value.customerMessages ?? []}
          onChange={next => onChange({ customerMessages: next })}
        />
      </Question>

      <Question label="Quiet hours" hint="FieldLoop won't send an automatic message to a customer after this time.">
        <ChipChoice label="Quiet hours" options={QUIET_OPTIONS} value={value.quietHours} onChange={next => onChange({ quietHours: next })} />
      </Question>
    </>
  )
}

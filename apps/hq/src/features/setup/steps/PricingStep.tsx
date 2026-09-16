"use client"

import { ChipChoice, ChipMulti, Question, Stepper } from "../primitives"
import type { PricingAnswers } from "../types"

const MODEL_OPTIONS = [
  { value: "hourly", label: "Hourly" },
  { value: "fixed", label: "Fixed price per job" },
  { value: "callout_hourly", label: "Call-out fee + hourly", recommended: true },
  { value: "mixed", label: "Mix by job type" }
] as const

const TERMS_OPTIONS = [
  { value: "on_completion", label: "On completion", recommended: true },
  { value: "7_days", label: "7 days" },
  { value: "14_days", label: "14 days" },
  { value: "30_days", label: "30 days" }
] as const

const PAYMENT_METHOD_OPTIONS = [
  { value: "card_on_site", label: "Card on site" },
  { value: "pay_by_link", label: "Pay-by-link" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" }
] as const

export function PricingStep({
  value,
  onChange,
  errors
}: {
  value: Partial<PricingAnswers>
  onChange: (patch: Partial<PricingAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question label="How do you price jobs?" hint="This shapes the invoice builder your technicians use on site.">
        <ChipChoice label="Pricing model" options={MODEL_OPTIONS} value={value.model} onChange={next => onChange({ model: next })} />
      </Question>

      <Question label="Call-out fee" optional hint="A starting suggestion — change it any time in Settings, and per job on the invoice.">
        <Stepper label="Call-out fee" value={value.calloutFee ?? 90} onChange={next => onChange({ calloutFee: next })} min={0} max={500} step={10} prefix="$" />
      </Question>

      <Question label="Standard hourly rate" optional hint="Used to prefill the invoice builder — technicians can always adjust it.">
        <Stepper label="Hourly rate" value={value.hourlyRate ?? 130} onChange={next => onChange({ hourlyRate: next })} min={0} max={400} step={5} prefix="$" suffix="/hr" />
      </Question>

      <Question label="Payment terms" hint="Shown on invoices as the due date.">
        <ChipChoice label="Payment terms" options={TERMS_OPTIONS} value={value.paymentTerms} onChange={next => onChange({ paymentTerms: next })} />
      </Question>

      <Question label="How do customers pay?" hint="Pay-by-link needs Stripe connected — you'll set that up on the Integrations step.">
        <ChipMulti
          label="Payment methods"
          options={PAYMENT_METHOD_OPTIONS}
          values={value.paymentMethods ?? []}
          onChange={next => onChange({ paymentMethods: next })}
        />
      </Question>
    </>
  )
}

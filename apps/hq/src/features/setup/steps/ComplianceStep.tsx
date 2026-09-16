"use client"

import { ChipChoice, ChipMulti, Question } from "../primitives"
import type { ComplianceAnswers } from "../types"

const CERT_OPTIONS = [
  { value: "plumbing_coc", label: "Plumbing compliance certificate" },
  { value: "gas_coc", label: "Gas compliance certificate" },
  { value: "backflow", label: "Backflow test report" },
  { value: "hot_water", label: "Hot water installation record" },
  { value: "swms", label: "SWMS / JSA" }
] as const

const PHOTO_OPTIONS = [
  { value: "before_after", label: "Before & after", recommended: true },
  { value: "before_during_after", label: "Before, during & after" },
  { value: "optional", label: "Optional" }
] as const

const SIGNATURE_OPTIONS = [
  { value: "customer", label: "Customer only", recommended: true },
  { value: "plumber", label: "Plumber only" },
  { value: "both", label: "Both" },
  { value: "none", label: "Neither" }
] as const

const COMPLETION_OPTIONS = [
  { value: "checklist", label: "Checklist complete" },
  { value: "signature", label: "Signature captured" },
  { value: "photos", label: "Photos attached" },
  { value: "compliance_form", label: "Compliance form filed" },
  { value: "payment", label: "Payment taken" }
] as const

export function ComplianceStep({
  value,
  onChange,
  errors
}: {
  value: Partial<ComplianceAnswers>
  onChange: (patch: Partial<ComplianceAnswers>) => void
  errors: Record<string, string>
}) {
  return (
    <>
      <Question label="Which certificates do you issue?" hint="Adds a reminder before these jobs are marked complete, and files the certificate in Documents." optional>
        <ChipMulti label="Certificates" options={CERT_OPTIONS} values={value.certificates ?? []} onChange={next => onChange({ certificates: next })} />
      </Question>

      <Question label="Photo evidence" hint="How many photos a technician is expected to take per job.">
        <ChipChoice label="Photo evidence" options={PHOTO_OPTIONS} value={value.photoEvidence} onChange={next => onChange({ photoEvidence: next })} />
      </Question>

      <Question label="Who signs off on a job?" hint="Prompts a signature screen on the technician's phone at completion.">
        <ChipChoice label="Signatures" options={SIGNATURE_OPTIONS} value={value.signatures} onChange={next => onChange({ signatures: next })} />
      </Question>

      <Question label="What's required before a job can be marked complete?" hint="A technician can't finish a job until everything you pick here is done.">
        <ChipMulti
          label="Completion requirements"
          options={COMPLETION_OPTIONS}
          values={value.completionRequires ?? []}
          onChange={next => onChange({ completionRequires: next })}
        />
      </Question>
    </>
  )
}

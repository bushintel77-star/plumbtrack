"use client"

import { useState } from "react"
import { Loader2, Search } from "lucide-react"

import { ChipChoice, Question, TextField } from "../primitives"
import { setupApi, readableError, type AbnLookup } from "../api"
import type { BusinessAnswers } from "../types"

const ENTITY_OPTIONS = [
  { value: "sole_trader", label: "Sole trader" },
  { value: "partnership", label: "Partnership" },
  { value: "company", label: "Company" },
  { value: "trust", label: "Trust" }
] as const

const GST_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
] as const

export function BusinessStep({
  value,
  onChange,
  errors
}: {
  value: Partial<BusinessAnswers>
  onChange: (patch: Partial<BusinessAnswers>) => void
  errors: Record<string, string>
}) {
  const [abnInput, setAbnInput] = useState(value.abn ?? "")
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupResult, setLookupResult] = useState<AbnLookup | null>(null)

  const lookUp = async () => {
    const digits = abnInput.replace(/\s+/g, "")
    if (!/^\d{11}$/.test(digits)) {
      setLookupError("An ABN is 11 digits.")
      return
    }
    setLooking(true)
    setLookupError(null)
    try {
      const result = await setupApi.lookupAbn(digits)
      setLookupResult(result)
      onChange({
        abn: result.abn,
        legalName: result.legalName ?? value.legalName ?? "",
        tradingName: result.tradingNames[0] ?? value.tradingName,
        gstRegistered: result.gstRegistered
      })
    } catch (error) {
      setLookupError(readableError(error, "Couldn't look that ABN up. Type the business details instead."))
    } finally {
      setLooking(false)
    }
  }

  return (
    <>
      <Question
        label="What's your ABN?"
        hint="Find it on your invoices, your ABN registration, or search it at abr.business.gov.au. We'll fill in the rest for you."
        optional
      >
        <TextField
          label="ABN"
          value={abnInput}
          onChange={next => {
            setAbnInput(next)
            setLookupError(null)
          }}
          placeholder="11 digits, e.g. 51 824 753 556"
          inputMode="numeric"
          maxLength={14}
          width="short"
          error={lookupError}
          right={
            <button
              type="button"
              onClick={() => void lookUp()}
              disabled={looking}
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-chrome-600 bg-chrome-wash px-4 text-sm font-semibold text-chrome-600 hover:brightness-105 disabled:opacity-60"
            >
              {looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Look up
            </button>
          }
        />
        {lookupResult && (
          <p className="mt-2 text-xs font-medium text-complete">
            Found it — {lookupResult.legalName ?? "business"} in {lookupResult.state ?? "your state"}. Details filled in below.
          </p>
        )}
      </Question>

      <Question label="Business name" hint="Your registered legal name — this is what appears on invoices and compliance certificates." error={errors.legalName}>
        <TextField
          label="Legal name"
          value={value.legalName ?? ""}
          onChange={next => onChange({ legalName: next })}
          placeholder="Caulfield South Plumbing Pty Ltd"
          width="medium"
        />
      </Question>

      <Question label="Trading name" optional hint="What customers actually see, if different from the legal name.">
        <TextField
          label="Trading name"
          value={value.tradingName ?? ""}
          onChange={next => onChange({ tradingName: next })}
          placeholder="Caulfield South Plumbing"
          width="medium"
        />
      </Question>

      <Question label="Business structure" optional hint="This changes nothing in Crewline today — it's here so it's on file for later.">
        <ChipChoice
          label="Business structure"
          options={ENTITY_OPTIONS}
          value={value.entityType}
          onChange={next => onChange({ entityType: next })}
        />
      </Question>

      <Question label="Registered for GST?" hint="Sets 10% GST on invoices and quotes automatically.">
        <ChipChoice
          label="Registered for GST"
          options={GST_OPTIONS}
          value={value.gstRegistered === undefined ? undefined : value.gstRegistered ? "yes" : "no"}
          onChange={next => onChange({ gstRegistered: next === "yes" })}
        />
      </Question>

      <Question label="Home base address" optional hint="Where jobs are measured from for travel time and the service area you set next.">
        <TextField
          label="Home base address"
          value={value.baseAddress ?? ""}
          onChange={next => onChange({ baseAddress: next })}
          placeholder="14 Grange Rd, Caulfield South VIC"
        />
      </Question>
    </>
  )
}

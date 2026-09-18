"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, PartyPopper, X } from "lucide-react"

import { AreaStep } from "./steps/AreaStep"
import { BusinessStep } from "./steps/BusinessStep"
import { ComplianceStep } from "./steps/ComplianceStep"
import { CommsStep } from "./steps/CommsStep"
import { FieldAppStep } from "./steps/FieldAppStep"
import { IntegrationsStep } from "./steps/IntegrationsStep"
import { InviteStep } from "./steps/InviteStep"
import { PricingStep } from "./steps/PricingStep"
import { ServicesStep } from "./steps/ServicesStep"
import { TeamStep } from "./steps/TeamStep"
import { StepFooter, StepHeading } from "./primitives"
import { readableError, setupApi, StepValidationError, type SetupState, type SetupStep } from "./api"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface StepDefinition {
  id: SetupStep
  title: string
  lede: string
  required: boolean
}

const STEP_DEFS: StepDefinition[] = [
  { id: "business", title: "Your business", lede: "The details that appear on invoices and compliance certificates.", required: true },
  { id: "team", title: "Your team", lede: "Who's doing the work — this shapes how much detail the dispatch board shows.", required: true },
  { id: "services", title: "What you do", lede: "The types of work you take on — this sets up job types, checklists and forms automatically.", required: true },
  { id: "area", title: "Where and when", lede: "Your service area and the hours you're usually working.", required: false },
  { id: "pricing", title: "Pricing & payments", lede: "A starting point for the invoice builder — change any of it later.", required: false },
  { id: "comms", title: "Customer messages", lede: "What Crewline tells customers automatically, and when it stays quiet.", required: false },
  { id: "compliance", title: "Compliance & sign-off", lede: "What has to happen before a job counts as done.", required: false },
  { id: "fieldapp", title: "Field app defaults", lede: "How the technician app behaves for a new team member.", required: false },
  { id: "integrations", title: "Connect your apps", lede: "Accounting, payments, messaging and more — connect what you already use.", required: false },
  { id: "invite", title: "Invite your team", lede: "Get everyone into Crewline — no typing required.", required: false }
]

/** Every answers object starts empty; steps merge in what's already saved. */
type Answers = Record<string, unknown>

function stepBody(id: SetupStep, answers: Answers, onChange: (patch: Answers) => void, errors: Record<string, string>) {
  switch (id) {
    case "business":
      return <BusinessStep value={answers} onChange={onChange} errors={errors} />
    case "team":
      return <TeamStep value={answers} onChange={onChange} errors={errors} />
    case "services":
      return <ServicesStep value={answers} onChange={onChange} errors={errors} />
    case "area":
      return <AreaStep value={answers} onChange={onChange} errors={errors} />
    case "pricing":
      return <PricingStep value={answers} onChange={onChange} errors={errors} />
    case "comms":
      return <CommsStep value={answers} onChange={onChange} errors={errors} />
    case "compliance":
      return <ComplianceStep value={answers} onChange={onChange} errors={errors} />
    case "fieldapp":
      return <FieldAppStep value={answers} onChange={onChange} errors={errors} />
    case "integrations":
      return <IntegrationsStep />
    case "invite":
      return <InviteStep value={answers} onChange={onChange} />
    default:
      return null
  }
}

function StepRailItem({
  def,
  index,
  state,
  active,
  onSelect
}: {
  def: StepDefinition
  index: number
  state: "done" | "skipped" | "current" | "upcoming"
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        active ? "bg-chrome-wash" : "hover:bg-recess"
      )}
    >
      <span
        className={cn(
          "label-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]",
          state === "done" && "bg-complete text-on-accent",
          state === "skipped" && "border border-dashed border-line-strong text-ink-low",
          state === "current" && "bg-chrome-600 text-on-accent",
          state === "upcoming" && "border border-line text-ink-low"
        )}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-semibold", active ? "text-ink" : "text-ink-mid")}>{def.title}</span>
        {state === "skipped" && <span className="label-mono text-2xs text-ink-low">SKIPPED</span>}
      </span>
    </button>
  )
}

/**
 * The guided setup wizard — one question per screen, chips over typing, and
 * every answer saved to the server as it's made (design brief:
 * docs/ONBOARDING_LAUNCH_PROMPT.md). Owner/admin only; the API enforces that
 * independently of this UI.
 */
export function SetupWizard({ onExit }: { onExit: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ["setup"], queryFn: () => setupApi.state() })

  const [activeStep, setActiveStep] = useState<SetupStep>("business")
  const [draftAnswers, setDraftAnswers] = useState<Record<SetupStep, Answers>>({} as Record<SetupStep, Answers>)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [hydratedFrom, setHydratedFrom] = useState<SetupState | null>(null)

  // Resume where the operator left off, once, when the server state first loads.
  useEffect(() => {
    if (!data || hydratedFrom) return
    setActiveStep(data.status === "complete" ? "business" : data.currentStep)
    setReviewing(data.status === "complete")
    setHydratedFrom(data)
  }, [data, hydratedFrom])

  const currentIndex = STEP_DEFS.findIndex(def => def.id === activeStep)
  const currentDef = STEP_DEFS[currentIndex]
  const currentAnswers = draftAnswers[activeStep] ?? data?.answers[activeStep] ?? {}

  const stepState = useMemo(() => {
    const map = new Map<SetupStep, "done" | "skipped" | "current" | "upcoming">()
    for (const def of STEP_DEFS) {
      if (def.id === activeStep && !reviewing) map.set(def.id, "current")
      else if (data?.completedSteps.includes(def.id)) map.set(def.id, "done")
      else if (data?.skippedSteps.includes(def.id)) map.set(def.id, "skipped")
      else map.set(def.id, "upcoming")
    }
    return map
  }, [data, activeStep, reviewing])

  const goTo = (step: SetupStep) => {
    setReviewing(false)
    setErrors({})
    setActiveStep(step)
  }

  const updateAnswers = (patch: Answers) => {
    setDraftAnswers(current => ({ ...current, [activeStep]: { ...currentAnswers, ...patch } }))
    setErrors({})
  }

  const persistStep = async (intent: "complete" | "skip", nextStep?: SetupStep) => {
    setSaving(true)
    setErrors({})
    try {
      const result = await setupApi.saveStep({ step: activeStep, answers: currentAnswers, intent, nextStep })
      queryClient.setQueryData(["setup"], result)
      return true
    } catch (thrown) {
      if (thrown instanceof StepValidationError) {
        const fieldErrors: Record<string, string> = {}
        for (const issue of thrown.issues) fieldErrors[issue.path || "_"] = issue.message
        setErrors(fieldErrors)
        toast({ title: "Check that step", description: thrown.issues[0]?.message, variant: "destructive" })
      } else {
        toast({ title: "Couldn't save", description: readableError(thrown, "Try again in a moment."), variant: "destructive" })
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const next = async () => {
    const isLast = currentIndex === STEP_DEFS.length - 1
    const nextStep = isLast ? activeStep : STEP_DEFS[currentIndex + 1].id
    const ok = await persistStep("complete", isLast ? undefined : nextStep)
    if (!ok) return
    if (isLast) setReviewing(true)
    else goTo(nextStep)
  }

  const skip = async () => {
    const isLast = currentIndex === STEP_DEFS.length - 1
    const nextStep = isLast ? activeStep : STEP_DEFS[currentIndex + 1].id
    const ok = await persistStep("skip", isLast ? undefined : nextStep)
    if (!ok) return
    if (isLast) setReviewing(true)
    else goTo(nextStep)
  }

  const back = () => {
    if (reviewing) {
      goTo(STEP_DEFS[STEP_DEFS.length - 1].id)
      return
    }
    if (currentIndex > 0) goTo(STEP_DEFS[currentIndex - 1].id)
  }

  const launch = async () => {
    setLaunching(true)
    try {
      const result = await setupApi.launch()
      queryClient.setQueryData(["setup"], result)
      toast({ title: "Crewline is set up", description: "Your team can start using it now." })
      onExit()
    } catch (thrown) {
      toast({ title: "Not quite ready", description: readableError(thrown, "A few required steps still need finishing."), variant: "destructive" })
    } finally {
      setLaunching(false)
    }
  }

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-mid">Loading setup…</div>
  }
  if (error || !data) {
    return <div className="flex h-full items-center justify-center text-sm text-urgent">Couldn&apos;t load setup. Refresh the page to try again.</div>
  }

  const missingRequired = data.requiredSteps.filter(step => !data.completedSteps.includes(step))

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-card px-6 py-3">
        <div>
          <p className="label-mono text-2xs text-ink-low">CREWLINE SETUP</p>
          <p className="text-sm font-semibold text-ink">
            {data.progress.done} of {data.progress.total} steps done
          </p>
          <div
            className="mt-1.5 h-1 w-44 overflow-hidden rounded-full bg-recess"
            role="progressbar"
            aria-valuenow={data.progress.done}
            aria-valuemin={0}
            aria-valuemax={data.progress.total}
            aria-label="Setup progress"
          >
            <div
              className="h-full bg-chrome-600 transition-all"
              style={{ width: `${data.progress.total > 0 ? Math.round((data.progress.done / data.progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-mid hover:bg-recess"
        >
          <X className="h-4 w-4" /> Exit setup
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Setup steps" className="w-64 shrink-0 overflow-y-auto border-r border-line bg-card p-3">
          <div className="space-y-1">
            {STEP_DEFS.map((def, index) => (
              <StepRailItem
                key={def.id}
                def={def}
                index={index}
                state={stepState.get(def.id) ?? "upcoming"}
                active={!reviewing && def.id === activeStep}
                onSelect={() => goTo(def.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              reviewing ? "bg-chrome-wash" : "hover:bg-recess"
            )}
          >
            <span className="label-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-ink-low">
              <PartyPopper className="h-3.5 w-3.5" />
            </span>
            <span className={cn("text-sm font-semibold", reviewing ? "text-ink" : "text-ink-mid")}>Review & launch</span>
          </button>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Content left-aligns to the rail with a 1160px ceiling — a form
              under a step rail should align to the rail, not float centred
              in a full-width main. The sticky footers live OUTSIDE this
              column so they back the full main width. */}
          <div className="max-w-[1160px] px-6 py-6 pb-4">
            {reviewing ? (
              <>
                <StepHeading index={STEP_DEFS.length + 1} total={STEP_DEFS.length + 1} title="Review & launch" lede="Here's what Crewline is set up to do. You can jump back to any step to change something." />
                <div className="mt-6 space-y-3">
                  {STEP_DEFS.map((def, index) => {
                    const state = stepState.get(def.id)
                    return (
                      <button
                        key={def.id}
                        type="button"
                        onClick={() => goTo(def.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-line bg-card px-4 py-3 text-left hover:border-chrome-400"
                      >
                        <span className="flex items-center gap-3">
                          <span className="label-mono flex h-6 w-6 items-center justify-center rounded-full bg-recess text-[11px] text-ink-low">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold text-ink">{def.title}</span>
                        </span>
                        <span className="label-mono text-2xs text-ink-low">
                          {state === "done" ? "DONE" : state === "skipped" ? "SKIPPED — TAP TO SET UP" : "NOT STARTED"}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {missingRequired.length > 0 && (
                  <p className="mt-6 text-sm font-semibold text-pending">
                    Finish {missingRequired.map(step => STEP_DEFS.find(def => def.id === step)?.title ?? step).join(", ")} before you launch.
                  </p>
                )}

              </>
            ) : (
              <>
                <StepHeading index={currentIndex + 1} total={STEP_DEFS.length} title={currentDef.title} lede={currentDef.lede} />
                <div className="mt-2">{stepBody(activeStep, currentAnswers, updateAnswers, errors)}</div>
              </>
            )}
          </div>

          {reviewing ? (
            <div className="sticky bottom-0 mt-8 border-t border-line bg-card px-6 py-4">
              <div className="flex w-full max-w-[1160px] items-center gap-3">
                <button
                  type="button"
                  onClick={back}
                  className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink-mid hover:border-chrome-400"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void launch()}
                  disabled={launching || missingRequired.length > 0}
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-[image:var(--btn-primary-bg)] px-5 text-sm font-bold text-on-accent shadow-hardware hover:brightness-110 disabled:opacity-50"
                >
                  <PartyPopper className="h-4 w-4" />
                  {launching ? "Launching…" : "Launch Crewline"}
                </button>
              </div>
            </div>
          ) : (
            <StepFooter
              onBack={back}
              onNext={() => void next()}
              onSkip={currentDef.required ? undefined : () => void skip()}
              nextLabel={currentIndex === STEP_DEFS.length - 1 ? "Review & launch" : `Next: ${STEP_DEFS[currentIndex + 1].title}`}
              busy={saving}
              canGoBack={currentIndex > 0}
            />
          )}
        </main>
      </div>
    </div>
  )
}

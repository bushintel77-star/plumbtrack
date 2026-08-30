"use client"

import { useEffect } from "react"
import { blockLabel, isoDay } from "@/lib/format"
import { jobDay } from "@/lib/schedule"
import { DEPOT } from "@/lib/optimize"
import { travelMinutes } from "@/lib/travel"
import { useBoardStore } from "@/stores/boardStore"
import type { Job } from "@/types"

/**
 * FSM → Slack state-machine mapping (research §Slack FSM integration):
 *
 *   FSM transition            Slack action
 *   ────────────────────────  ─────────────────────────────────────────────
 *   job enters unassigned     alert card in #dispatch-queue w/ Accept btn
 *   techId null → set         rewrite card as claimed (button disabled)
 *   status → en_route         gray the card, attach live ETA
 *   status → active           spin up temporary #job-{id} channel
 *   status → complete         push field summary, archive the channel
 *
 * Implemented as a store subscription so EVERY transition source is bridged —
 * drag-drops, context-menu overrides, remote telemetry (WSS) and the
 * optimizer's atomic apply all fan out to Slack cards uniformly.
 */

function etaFor(job: Job): number {
  const state = useBoardStore.getState()
  const tech = state.technicians.find(t => t.id === job.techId)
  if (!tech || !job.location) {
    return travelMinutes(DEPOT, job.location ?? DEPOT)
  }
  // Location is intentionally not read from live telemetry. Use the depot
  // estimate until an approved point-in-time clock-in/out location contract
  // is available for this workflow.
  return travelMinutes(DEPOT, job.location)
}

export function useSlackBridge(): void {
  useEffect(() => {
    const store = useBoardStore.getState()

    // Bootstrap: today's unassigned queue already needs its alert cards.
    const today = isoDay(0)
    for (const job of Object.values(store.jobs)) {
      if (job.status === "unassigned" && jobDay(job) === today) {
        store.postSlackCard({
          jobId: job.id,
          kind: "new-job",
          channel: "dispatch-queue",
          title: job.title,
          client: job.client,
          body: `New ${job.priority} task in ${job.region ?? "the region"} — ${job.address}. Needs ${
            job.requiredSkill ?? "no special skill"
          }. Accept to claim.`,
          claimedBy: null,
          actionsDisabled: false
        })
      }
    }

    let prev = useBoardStore.getState().jobs
    let handling = false
    const unsubscribe = useBoardStore.subscribe(state => {
      const next = state.jobs
      if (next === prev || handling) return
      // Re-entrancy guard: the transitions below set() synchronously, which
      // re-notifies subscribers before `prev` advances — without the guard a
      // single assignment would recurse into a max-update-depth crash.
      handling = true
      const before = prev
      prev = next
      try {
        const actions = useBoardStore.getState()

        for (const job of Object.values(next)) {
          const prior = before[job.id]
          if (!prior) continue

        if (prior.techId === null && job.techId) {
          const tech = state.technicians.find(t => t.id === job.techId)
          actions.rewriteSlackCard(job.id, {
            kind: "claimed",
            claimedBy: tech?.name.split(" ")[0] ?? job.techId,
            actionsDisabled: true,
            body: `Claimed — starting ${blockLabel(job.startBlock)} on ${
              tech?.van ?? "their van"
            }.`
          })
        }

        if (prior.status !== "en_route" && job.status === "en_route") {
          actions.rewriteSlackCard(job.id, {
            kind: "en-route",
            actionsDisabled: true,
            etaMinutes: etaFor(job),
            body: "Technician en route — acceptance closed, ETA updating live."
          })
        }

        if (prior.status !== "active" && job.status === "active") {
          actions.rewriteSlackCard(job.id, {
            kind: "on-site",
            actionsDisabled: true,
            body: `On site — collaboration moved to #job-${job.id} (temporary channel).`
          })
          actions.spinUpJobChannel(job.id, job.title)
        }

        if (prior.status !== "complete" && job.status === "complete") {
          actions.rewriteSlackCard(job.id, {
            kind: "complete",
            actionsDisabled: true,
            body: `Completed — ${Math.round(job.elapsedSeconds / 60)} min on site, field notes and parts synced to the FSM record.`
          })
          actions.archiveJobChannel(job.id)
        }

        // A fresh unassigned job arriving from the API/queue mid-shift.
        if (
          prior.status !== "unassigned" &&
          job.status === "unassigned" &&
          !actions.slackFeed.some(c => c.jobId === job.id)
        ) {
          actions.postSlackCard({
            jobId: job.id,
            kind: "new-job",
            channel: "dispatch-queue",
            title: job.title,
            client: job.client,
            body: `New ${job.priority} task — ${job.address}. Accept to claim.`,
            claimedBy: null,
            actionsDisabled: false
          })
        }
      }
      } finally {
        handling = false
      }
    })

    return unsubscribe
  }, [])
}

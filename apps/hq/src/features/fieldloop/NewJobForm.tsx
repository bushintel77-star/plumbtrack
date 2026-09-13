"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { toast } from "@/hooks/use-toast"
import { apiRequest } from "@/lib/api"
import { useBoardStore } from "@/stores/boardStore"

/**
 * Job intake — the dispatch console's only job-create path. Posts a real
 * record through POST /api/jobs; the API attaches a schedulable appointment
 * so the new job is assignable the moment the board's poll picks it up.
 * There is no offline queue for creates: intake needs a live connection and
 * the form says so rather than pretending a queued job exists.
 */
export function NewJobForm() {
  const dataMode = useBoardStore(s => s.dataMode)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [client, setClient] = useState("")
  const [address, setAddress] = useState("")
  const [scope, setScope] = useState("")
  const [phone, setPhone] = useState("")

  const reset = () => {
    setClient("")
    setAddress("")
    setScope("")
    setPhone("")
  }

  const submit = async () => {
    if (busy) return
    if (!client.trim() || !address.trim() || !scope.trim()) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Client, address and scope are required to book a job."
      })
      return
    }
    if (dataMode !== "live") {
      toast({
        variant: "destructive",
        title: "Not connected",
        description: "New jobs need a live API connection — reconnect and try again."
      })
      return
    }
    setBusy(true)
    try {
      await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          client: client.trim(),
          address: address.trim(),
          scope: scope.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {})
        })
      })
      toast({
        title: "Job created",
        description: `${client.trim()} — it lands in this queue on the next refresh, ready to drag onto a crew.`
      })
      reset()
      setOpen(false)
    } catch {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: "The API rejected or didn't receive the job — nothing was saved."
      })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fl-queue-job"
        data-testid="fl-new-job-open"
        onClick={() => setOpen(true)}
        style={{ cursor: "pointer", borderStyle: "dashed" }}
      >
        <Plus size={12} /> New job
      </button>
    )
  }

  return (
    <div
      data-testid="fl-new-job-form"
      style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flex: 1 }}
    >
      {(
        [
          ["Client", client, setClient, "fl-new-job-client"],
          ["Site address", address, setAddress, "fl-new-job-address"],
          ["Scope of work", scope, setScope, "fl-new-job-scope"],
          ["Phone (optional)", phone, setPhone, "fl-new-job-phone"]
        ] as const
      ).map(([label, value, setter, testid]) => (
        <div className="fl-input" key={testid} style={{ flex: "1 1 140px" }}>
          <input
            aria-label={label}
            placeholder={label}
            value={value}
            data-testid={testid}
            onChange={event => setter(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") void submit()
              if (event.key === "Escape") setOpen(false)
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="fl-queue-job"
        data-testid="fl-new-job-submit"
        disabled={busy}
        onClick={() => void submit()}
        style={{ cursor: "pointer", fontWeight: 600 }}
      >
        {busy ? "Saving…" : "Create job"}
      </button>
      <button
        type="button"
        className="fl-queue-job"
        data-testid="fl-new-job-cancel"
        onClick={() => {
          setOpen(false)
          reset()
        }}
        style={{ cursor: "pointer" }}
      >
        Cancel
      </button>
    </div>
  )
}

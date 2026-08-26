"use client";

import { useState } from "react";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet, SheetActionCard } from "@/components/ui/BottomSheet";
import { IconVanRoute } from "@/components/icons/FieldIcons";

const ETA_CHOICES = [15, 30, 45, 60] as const;

/**
 * Customer-facing arrival ping (ServiceM8 "Track My Arrival" fundamental)
 * built on the existing queued-notification pipeline — works offline, syncs
 * when connectivity returns.
 */
export function OnTheWayButton({ jobId }: { jobId: string }) {
  const { sendOnTheWay } = usePlumbTrackCtx();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  const send = (eta: number) => {
    sendOnTheWay(jobId, eta);
    setSent(eta);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={sent !== null}
        className={`w-full min-h-[48px] mt-2 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold border transition haptic ${
          sent !== null
            ? "bg-complete-dim text-complete border-complete-line"
            : "bg-fill-strong text-ink border-line"
        }`}
      >
        <IconVanRoute size={17} />
        {sent !== null ? `Customer told — ETA ${sent} min` : "On the way — ping the customer"}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Tell the customer you're coming"
        subtitle="Sends an arrival ETA through the dispatcher — queued offline if signal is weak"
        label="Send on-the-way ETA"
      >
        <div className="grid grid-cols-2 gap-2">
          {ETA_CHOICES.map((eta) => (
            <SheetActionCard
              key={eta}
              icon={IconVanRoute}
              title={`About ${eta} minutes`}
              hint="ETA ping to the client and #field-updates"
              onClick={() => send(eta)}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

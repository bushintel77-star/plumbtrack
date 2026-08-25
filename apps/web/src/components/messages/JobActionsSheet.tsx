"use client";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet, SheetActionCard } from "@/components/ui/BottomSheet";

/** Bottom sheet of quick job actions — clock, photos, Slack update, sign-off. */
export function JobActionsSheet({
  open,
  onClose,
  onClockPress,
}: {
  open: boolean;
  onClose: () => void;
  onClockPress: () => void;
}) {
  const { job, addPhoto, postMessage, setView, running, currentStaffId } = usePlumbTrackCtx();

  if (!job) return null;

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Job actions"
      subtitle={`${job.id} · ${job.client}`}
      label="Job actions"
    >
      <div className="grid grid-cols-2 gap-2.5">
        <SheetActionCard
          emoji="⏱️"
          title={running ? "Clock Off" : "Clock On"}
          hint={running ? "Stop the timer" : "Pick who's clocking on"}
          onClick={() => run(onClockPress)}
        />
        <SheetActionCard
          emoji="📸"
          title="Add photo"
          hint="Capture work on site"
          onClick={() => run(() => addPhoto("On site"))}
        />
        <SheetActionCard
          emoji="💬"
          title="Post update"
          hint="Send to #field-updates"
          onClick={() => run(() => postMessage("field-updates", currentStaffId, `📢 ${job.id} — update from the field.`))}
        />
        <SheetActionCard
          emoji="✅"
          title="Go to sign-off"
          hint={job.photos.length === 0 ? "Add a photo first" : "Client sign-off"}
          disabled={job.photos.length === 0}
          onClick={() => run(() => setView("signoff"))}
        />
      </div>
    </BottomSheet>
  );
}

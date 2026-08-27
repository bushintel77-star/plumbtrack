"use client";

import { Check } from "lucide-react";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { formatSerial } from "@/lib/display";

const MUTED = "var(--text-subtle)";
const BORDER = "var(--surface-border)";

function firstName(name: string): string {
  return name.split(" ")[0];
}

/**
 * Staff picker used at clock-in ("who's clocking on?") and to switch the
 * device operator. Every time entry records its staff member, and each staff
 * member has their own open entry per job.
 */
export function StaffClockInSheet({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: "clockin" | "switch";
  onClose: () => void;
}) {
  const { job, staffMembers, currentStaffId, setCurrentStaffId, startClockOn } = usePlumbTrackCtx();

  const pick = (staffId: string) => {
    if (mode === "clockin" && job) {
      startClockOn(job.id, staffId);
    } else {
      setCurrentStaffId(staffId);
    }
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={mode === "clockin" ? "Who's clocking on?" : "Working as"}
      subtitle={
        mode === "clockin"
          ? job
            ? `${formatSerial(job.id)} · ${job.client}`
            : "Select a job to clock in"
          : "Switch who's operating this device"
      }
      label="Staff selection"
    >
      <div className="space-y-2.5">
        {staffMembers.map((member) => {
          const isCurrent = member.id === currentStaffId;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => pick(member.id)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl transition-transform active:scale-[0.98]"
              style={{
                background: isCurrent
                  ? "var(--accent-dim)"
                  : "linear-gradient(180deg, var(--sheet-tile) 0%, var(--sheet-tile-soft) 100%)",
                border: `1px solid ${isCurrent ? "var(--edge-highlight)" : BORDER}`,
                boxShadow: isCurrent
                  ? "inset 0 1px 0 var(--edge-highlight), 0 0 24px -6px var(--chrome-400), 0 4px 14px var(--app-shadow)"
                  : "var(--shadow-sheet), 0 4px 14px var(--app-shadow)",
              }}
            >
              <Avatar name={member.name} color={member.color} size={44} dot={member.presence === "active"} />
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-ink text-sm font-bold tracking-tight leading-tight">
                  {member.name}
                  {isCurrent && (
                    <span
                      className="ml-2 text-2xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--accent-dim)",
                        color: "var(--accent)",
                      }}
                    >
                      Current
                    </span>
                  )}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: MUTED }}>
                  {mode === "clockin" ? `Clock in as ${firstName(member.name)}` : `Switch to ${firstName(member.name)}`}
                  {member.presence === "away" && " · away"}
                </span>
              </span>
              {isCurrent && <Check size={20} className="text-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

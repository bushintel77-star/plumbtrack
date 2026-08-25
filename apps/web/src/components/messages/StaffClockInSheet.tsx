"use client";

import { Check } from "lucide-react";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet } from "@/components/ui/BottomSheet";

const MUTED = "#72767D";
const BORDER = "rgba(255,255,255,0.09)";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
            ? `${job.id} · ${job.client}`
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
                  ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent) 0%, color-mix(in srgb, var(--accent) 7%, transparent) 100%)"
                  : "linear-gradient(180deg, var(--sheet-tile) 0%, var(--sheet-tile-soft) 100%)",
                border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--accent) 35%, transparent)" : BORDER}`,
                boxShadow: isCurrent
                  ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.3)"
                  : "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px rgba(0,0,0,0.3)",
              }}
            >
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                style={{ backgroundColor: member.color }}
              >
                {initials(member.name)}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-white text-[14px] font-bold tracking-tight leading-tight">
                  {member.name}
                  {isCurrent && (
                    <span
                      className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
                        color: "var(--accent)",
                      }}
                    >
                      Current
                    </span>
                  )}
                </span>
                <span className="block text-[11.5px] mt-0.5" style={{ color: MUTED }}>
                  {mode === "clockin" ? `Clock in as ${firstName(member.name)}` : `Switch to ${firstName(member.name)}`}
                  {member.presence === "away" && " · away"}
                </span>
              </span>
              {isCurrent && <Check size={18} className="text-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

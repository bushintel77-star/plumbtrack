"use client";

import { useState } from "react";
import { CloudRain, PhoneCall, Sun } from "lucide-react";

import type { ShiftWorkType } from "@/types";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { BottomSheet, SheetActionCard } from "@/components/ui/BottomSheet";

const WORK_TYPES: { key: ShiftWorkType; icon: typeof Sun; title: string; hint: string }[] = [
  {
    key: "standard",
    icon: Sun,
    title: "Standard shift",
    hint: "Ordinary hours 7am–6pm Mon–Fri; overtime penalties apply outside the span",
  },
  {
    key: "callback",
    icon: PhoneCall,
    title: "Recall (call-back)",
    hint: "Called back outside hours — 2-hour minimum at 200% regardless of duration",
  },
  {
    key: "inclement",
    icon: CloudRain,
    title: "Inclement weather",
    hint: "Rain-affected shift — early log-off is paid to the end of ordinary hours",
  },
];

/**
 * Log-on gateway: picks the work type for award interpretation and records
 * the technician's acknowledgment that tracking runs only while logged on
 * (workplace surveillance notice).
 */
export function LogOnSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logOn, currentStaffName } = usePlumbTrackCtx();
  const [workType, setWorkType] = useState<ShiftWorkType>("standard");
  const [noticeAck, setNoticeAck] = useState(false);

  const confirm = () => {
    logOn(workType);
    setWorkType("standard");
    setNoticeAck(false);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Log on to your shift"
      subtitle={`${currentStaffName} — tracking runs from log-on until log-off, paused during unpaid meal breaks`}
      label="Shift log-on"
    >
      <div className="space-y-2.5">
        {WORK_TYPES.map((wt) => (
          <SheetActionCard
            key={wt.key}
            icon={wt.icon}
            title={wt.title}
            hint={wt.hint}
            onClick={() => setWorkType(wt.key)}
            disabled={false}
          />
        ))}
        {workType !== "standard" && (
          <p className="text-[11px] px-1" style={{ color: "var(--accent)" }}>
            Selected: {WORK_TYPES.find((wt) => wt.key === workType)?.title}
          </p>
        )}

        <label
          className="flex items-start gap-3 p-3.5 rounded-2xl cursor-pointer"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--app-border)" }}
        >
          <input
            type="checkbox"
            checked={noticeAck}
            onChange={(e) => setNoticeAck(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#E8871E]"
            aria-label="Acknowledge workplace tracking notice"
          />
          <span className="text-[12px] leading-snug" style={{ color: "var(--sheet-muted)" }}>
            I&apos;ve received the written tracking notice: while logged on, this device shares
            GPS location with dispatch for routing and customer ETAs. Tracking never runs
            off-duty, during unpaid breaks, or after log-off.
          </span>
        </label>

        <button
          type="button"
          onClick={confirm}
          disabled={!noticeAck}
          className="w-full py-3.5 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent/25"
        >
          Log On &amp; Start Shift
        </button>
      </div>
    </BottomSheet>
  );
}

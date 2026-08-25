"use client";

import { useState } from "react";
import { Coffee, LogIn, LogOut, Radio } from "lucide-react";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatDuration } from "@/lib/billing";
import { LogOnSheet } from "./LogOnSheet";
import { LogOffSheet } from "./LogOffSheet";

const WORK_TYPE_BADGE: Record<string, string> = {
  standard: "Standard shift",
  callback: "Call-back",
  inclement: "Inclement weather",
};

/**
 * Shift banner for the jobs list — the day-level log-on / log-off state
 * machine that bounds location tracking and drives award interpretation.
 */
export function ShiftCard() {
  const { activeShift, openBreak, trackingActive, startMealBreak, endMealBreak } = usePlumbTrackCtx();
  const [logOnOpen, setLogOnOpen] = useState(false);
  const [logOffOpen, setLogOffOpen] = useState(false);

  const shiftSeconds = useTimer(!!activeShift, activeShift ? new Date(activeShift.loggedOnAt).getTime() : null);
  const breakSeconds = useTimer(!!openBreak, openBreak ? new Date(openBreak.start).getTime() : null);

  // Both sheets stay mounted regardless of shift state — LogOffSheet holds
  // its completed-shift summary after the shift itself has ended.
  return (
    <>
      {activeShift ? (
        <GlassCard>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  trackingActive ? "bg-green-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-400">
                {openBreak ? "On break — tracking paused" : "On shift — tracking active"}
              </p>
            </div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400 border border-white/[0.07]">
              {WORK_TYPE_BADGE[activeShift.workType]}
            </span>
          </div>

          <p className="font-mono text-white text-3xl font-light tracking-wide tabular-nums">
            {formatDuration(shiftSeconds)}
          </p>
          {openBreak && (
            <p className="text-[11px] text-amber-400/90 mt-1 font-mono">
              Unpaid break · {formatDuration(breakSeconds)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-3.5">
            {openBreak ? (
              <button
                type="button"
                onClick={endMealBreak}
                className="py-3 rounded-xl bg-accent/15 text-accent text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] active:scale-[0.98] transition border border-accent/30"
              >
                <Coffee size={14} /> End Break
              </button>
            ) : (
              <button
                type="button"
                onClick={startMealBreak}
                className="py-3 rounded-xl bg-white/[0.04] text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] active:bg-white/[0.08] transition border border-white/[0.08]"
              >
                <Coffee size={14} /> Meal Break
              </button>
            )}
            <button
              type="button"
              onClick={() => setLogOffOpen(true)}
              className="py-3 rounded-xl bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] active:scale-[0.98] transition shadow-lg shadow-red-500/20"
            >
              <LogOut size={14} /> Log Off
            </button>
          </div>

          {trackingActive && (
            <p className="text-[10px] text-slate-600 mt-2.5 flex items-center gap-1.5">
              <Radio size={10} /> GPS shared with dispatch while on shift — never off-duty
            </p>
          )}
        </GlassCard>
      ) : (
        <button
          type="button"
          onClick={() => setLogOnOpen(true)}
          className="w-full surface-card surface-card--interactive p-4 flex items-center gap-3.5 text-left"
        >
          <span className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <LogIn size={20} className="text-accent" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-white text-[14.5px] font-bold tracking-tight">Off duty — log on to start</span>
            <span className="block text-[11.5px] text-slate-500 mt-0.5 leading-snug">
              Tracking runs only while logged on. Award penalties are worked out at log-off.
            </span>
          </span>
        </button>
      )}
      <LogOnSheet open={logOnOpen} onClose={() => setLogOnOpen(false)} />
      <LogOffSheet open={logOffOpen} onClose={() => setLogOffOpen(false)} />
    </>
  );
}

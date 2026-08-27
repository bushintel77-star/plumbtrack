"use client";

import { useState } from "react";
import { Check, LogOut, ShieldCheck } from "lucide-react";

import type { ShiftWorkType } from "@/types";
import { CENTS_PER_KM } from "@/lib/constants";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ShiftPayBreakdown, StpDisaggregation } from "@/lib/award";
import type { Shift } from "@/types";

const WORK_TYPE_LABELS: Record<ShiftWorkType, string> = {
  standard: "Standard",
  callback: "Call-back",
  inclement: "Inclement weather",
};

interface LogOffResult {
  shift: Shift;
  breakdown: ShiftPayBreakdown;
  stp: StpDisaggregation;
}

/**
 * Log-off gateway: finalises the shift, captures allowance/TOIL decisions,
 * previews the MA000036 pay interpretation, and confirms that tracking has
 * stopped before the technician goes off duty.
 */
export function LogOffSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeShift, interpretActiveShift, logOff } = usePlumbTrackCtx();
  const [km, setKm] = useState("");
  const [toil, setToil] = useState(false);
  const [workTypeOverride, setWorkTypeOverride] = useState<ShiftWorkType | "keep">("keep");
  const [done, setDone] = useState<LogOffResult | null>(null);

  // Live tick so the preview stays current while the sheet is open.
  const shiftStartMs = activeShift ? new Date(activeShift.loggedOnAt).getTime() : null;
  useTimer(open && !done, shiftStartMs);

  const effectiveWorkType: ShiftWorkType | undefined =
    workTypeOverride === "keep" ? undefined : workTypeOverride;
  const preview =
    activeShift && open && !done
      ? interpretActiveShift(new Date().toISOString(), effectiveWorkType)
      : null;

  const close = () => {
    setDone(null);
    setKm("");
    setToil(false);
    setWorkTypeOverride("keep");
    onClose();
  };

  const confirm = () => {
    const parsedKm = Number(km);
    const kmDriven = km.trim() ? Math.min(2000, Math.max(0, Number.isFinite(parsedKm) ? parsedKm : 0)) : undefined;
    const result = logOff({
      ...(effectiveWorkType ? { workType: effectiveWorkType } : {}),
      ...(kmDriven !== undefined ? { kmDriven } : {}),
      toilElection: toil,
    });
    if (result) setDone(result);
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={done ? "Shift complete" : "Log off shift"}
      subtitle={
        done
          ? "Timesheet finalised and tracking stopped"
          : "Award penalties are calculated at log-off (Plumbing & Fire Sprinklers Award MA000036)"
      }
      label="Shift log-off"
    >
      {done ? (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: "var(--status-complete-dim)", border: "1px solid var(--status-complete-border)" }}
          >
            <ShieldCheck size={20} className="text-complete shrink-0" />
            <p className="text-xs text-complete font-semibold">
              GPS tracking stopped — you are off duty and no longer monitored.
            </p>
          </div>

          <div className="space-y-1.5">
            {done.breakdown.components.map((c) => (
              <div key={c.code} className="flex justify-between text-sm">
                <span style={{ color: "var(--sheet-muted)" }}>
                  {c.label} · {c.hours.toFixed(2)} hrs
                </span>
                <span className="font-mono" style={{ color: "var(--app-text)" }}>
                  ${c.amount.toFixed(2)}
                </span>
              </div>
            ))}
            <div
              className="flex justify-between pt-2 mt-1 font-bold text-sm"
              style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text)" }}
            >
              <span>Gross pay</span>
              <span className="font-mono">${done.breakdown.grossPay.toFixed(2)}</span>
            </div>
          </div>

          {done.breakdown.notes.length > 0 && (
            <div className="p-3 rounded-xl space-y-1" style={{ background: "var(--surface-hover-subtle)" }}>
              <p className="text-2xs font-bold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
                Award rules applied
              </p>
              {done.breakdown.notes.map((n) => (
                <p key={n} className="text-xs leading-snug" style={{ color: "var(--sheet-muted)" }}>
                  • {n}
                </p>
              ))}
            </div>
          )}

          <div className="p-3 rounded-xl space-y-1.5" style={{ background: "var(--surface-hover-subtle)" }}>
            <p className="text-2xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--sheet-muted)" }}>
              STP Phase 2 reporting categories
            </p>
            <StpRow label="Ordinary time earnings (OTE)" value={done.stp.ordinaryTimeEarnings} />
            <StpRow label="Overtime (reported separately)" value={done.stp.overtime} />
            <StpRow label="Public holiday penalty" value={done.stp.publicHolidayPenalty} />
            <StpRow label={`Allowance — cents per km (${done.stp.kmClaimed} km)`} value={done.stp.centsPerKmAllowance} />
            {done.stp.toilAccruedHours > 0 && (
              <p className="text-xs" style={{ color: "var(--accent)" }}>
                TOIL accrued: {done.stp.toilAccruedHours.toFixed(2)} hrs at 1:1 — overtime paid $0.00
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={close}
            className="w-full py-3.5 rounded-xl bg-accent text-on-accent text-sm font-bold min-h-[48px] active:scale-[0.98] transition shadow-hardware"
          >
            Done
          </button>
        </div>
      ) : activeShift && preview ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-2xs font-bold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>
              Work type at log-off
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["keep", "callback", "inclement"] as const).map((wt) => (
                <button
                  key={wt}
                  type="button"
                  onClick={() => setWorkTypeOverride(wt)}
                  className="py-2.5 px-2 rounded-xl text-xs font-bold transition min-h-[44px]"
                  style={{
                    border: `1px solid ${workTypeOverride === wt ? "var(--edge-highlight)" : "var(--app-border)"}`,
                    background: workTypeOverride === wt
                      ? "var(--accent-dim)"
                      : "var(--surface-hover-subtle)",
                    color: workTypeOverride === wt ? "var(--accent)" : "var(--sheet-muted)",
                  }}
                >
                  {wt === "keep"
                    ? `As logged on (${WORK_TYPE_LABELS[activeShift.workType]})`
                    : WORK_TYPE_LABELS[wt]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-2xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--sheet-muted)" }}>
              Personal-vehicle travel (allowance at {CENTS_PER_KM}c/km)
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={km}
              onChange={(e) => {
                const next = e.target.value.replace(/[^0-9.]/g, "");
                const n = Number(next);
                setKm(Number.isFinite(n) && n > 2000 ? "2000" : next);
              }}
              max="2000"
              placeholder="Kilometres driven this shift (optional)"
              className="w-full app-input border rounded-lg px-3 py-2.5 text-sm"
              style={{ color: "var(--app-text)" }}
            />
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={{ background: "var(--surface-hover-subtle)" }}>
            <input
              type="checkbox"
              checked={toil}
              onChange={(e) => setToil(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
              aria-label="Bank overtime as Time Off In Lieu"
            />
            <span className="text-xs leading-snug" style={{ color: "var(--sheet-muted)" }}>
              Bank overtime as Time Off In Lieu (1:1) instead of pay — accrued hours are
              reported to payroll, not paid out.
            </span>
          </label>

          <div className="p-3 rounded-xl space-y-1.5" style={{ background: "var(--surface-hover-subtle)" }}>
            <p className="text-2xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--sheet-muted)" }}>
              Live pay interpretation
            </p>
            {preview.components.map((c) => (
              <div key={c.code} className="flex justify-between text-sm">
                <span style={{ color: "var(--sheet-muted)" }}>
                  {c.label} · {c.hours.toFixed(2)} hrs
                </span>
                <span className="font-mono" style={{ color: "var(--app-text)" }}>
                  ${c.amount.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-1.5 font-bold text-sm" style={{ color: "var(--app-text)" }}>
              <span>Gross (so far)</span>
              <span className="font-mono">${preview.grossPay.toFixed(2)}</span>
            </div>
            {preview.tenHourBreach && (
              <p className="text-xs text-pending leading-snug">
                ⚠ No 10-hour rest break since the last shift — this shift is paid at 200%
                until a full break is taken.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={confirm}
            className="w-full py-3.5 rounded-xl bg-urgent text-on-accent text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition shadow-hardware"
          >
            <LogOut size={16} /> Log Off &amp; Stop Tracking
          </button>
        </div>
      ) : (
        <p className="text-sm py-4 text-center" style={{ color: "var(--sheet-muted)" }}>
          No shift is running.
        </p>
      )}
    </BottomSheet>
  );
}

function StpRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: "var(--sheet-muted)" }}>{label}</span>
      {value > 0 ? (
        <span className="font-mono" style={{ color: "var(--app-text)" }}>
          ${value.toFixed(2)}
        </span>
      ) : (
        <span className="flex items-center text-ink-low">
          <Check size={12} className="mr-0.5" /> nil
        </span>
      )}
    </div>
  );
}

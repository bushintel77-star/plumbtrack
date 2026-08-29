"use client";

import { useState } from "react";

import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { formatDuration } from "@/lib/billing";
import {
  IconMugBreak,
  IconValve,
  IconValveShut,
} from "@/components/icons/FieldIcons";
import { ArrowRight } from "lucide-react";
import { LogOnSheet } from "./LogOnSheet";
import { LogOffSheet } from "./LogOffSheet";

const WORK_TYPE: Record<string, string> = {
  standard: "STD",
  callback: "CBK",
  inclement: "WET",
};

/**
 * ShiftCard — Hardware Chassis Design
 * From reference: widget-chassis container, data-hero timer, machined buttons
 */
export function ShiftCard() {
  const { activeShift, openBreak, trackingActive, startMealBreak, endMealBreak } = usePlumbTrackCtx();
  const [logOnOpen, setLogOnOpen] = useState(false);
  const [logOffOpen, setLogOffOpen] = useState(false);

  const shiftSeconds = useTimer(!!activeShift, activeShift ? new Date(activeShift.loggedOnAt).getTime() : null);
  const breakSeconds = useTimer(!!openBreak, openBreak ? new Date(openBreak.start).getTime() : null);

  const hours = Math.floor(shiftSeconds / 3600);
  const mins = Math.floor((shiftSeconds % 3600) / 60);
  const secs = shiftSeconds % 60;

  const breakMins = Math.floor(breakSeconds / 60);

  if (!activeShift) {
    return (
      <>
        <div className="widget-chassis shift-logon-chassis" data-testid="field-shift-card">
          <button
            type="button"
            onClick={() => setLogOnOpen(true)}
            className="shift-logon-button w-full text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center">
                <IconValve size={20} className="text-[var(--text-secondary)]" />
              </div>
              <div className="flex-1">
                <div className="text-title">LOG ON</div>
                <div className="label-micro" style={{ marginTop: "4px" }}>
                  Start shift tracking
                </div>
              </div>
              <ArrowRight size={20} className="text-accent shrink-0" aria-hidden />
            </div>
          </button>
        </div>
        <LogOnSheet open={logOnOpen} onClose={() => setLogOnOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="widget-chassis" data-testid="field-shift-card">
        {/* Header — Status indicator + Work order */}
        <header className="widget-header">
          <div className="status-indicator">
            <span className={`status-dot ${trackingActive ? "active" : "urgent"}`} />
            <span className="label-micro">
              {openBreak ? "On Break" : trackingActive ? "Active Route" : "Paused"}
            </span>
          </div>
          <span className="work-order-id">{WORK_TYPE[activeShift.workType]}</span>
        </header>

        <hr className="hairline-divider" />

        {/* Telemetry — Hero timer */}
        <div className="telemetry-grid">
          <div className="telemetry-data">
            <div className="data-block">
              <span className="label-micro">Elapsed</span>
              <div className="data-hero">
                {String(hours).padStart(2, "0")}
                <span className="data-unit">HR</span>
              </div>
            </div>
            <div className="data-block">
              <span className="label-micro">Minutes</span>
              <div className="data-hero">
                {String(mins).padStart(2, "0")}
                <span className="data-unit">MIN</span>
              </div>
            </div>
          </div>

          {/* Route axis — shift progress */}
          <div className="route-axis">
            <div className={`axis-node ${trackingActive ? "current" : ""}`} />
            <div className="axis-line" />
            <div className="axis-node" />
          </div>
        </div>

        {openBreak && (
          <div className="label-micro" style={{ color: "var(--status-pending)", marginBottom: "16px" }}>
            UNPAID BREAK · {breakMins}m
          </div>
        )}

        {/* Action array */}
        <div className="action-array">
          {openBreak ? (
            <button
              type="button"
              onClick={endMealBreak}
              className="btn-machined primary"
            >
              <IconMugBreak size={16} style={{ marginRight: "8px" }} /> END BREAK
            </button>
          ) : (
            <button
              type="button"
              onClick={startMealBreak}
              className="btn-machined secondary"
            >
              <IconMugBreak size={16} style={{ marginRight: "8px" }} /> BREAK
            </button>
          )}
          <button
            type="button"
            onClick={() => setLogOffOpen(true)}
            className="btn-machined secondary"
            style={{ 
              background: "var(--status-urgent-dim)",
              borderColor: "var(--status-urgent-border)"
            }}
          >
            <IconValveShut size={16} style={{ marginRight: "8px" }} /> LOG OFF
          </button>
        </div>

        {/* GPS notice */}
        {trackingActive && (
          <>
            <hr className="hairline-divider" style={{ marginTop: "24px" }} />
            <div className="label-micro" style={{ textAlign: "center" }}>
              GPS ACTIVE
            </div>
          </>
        )}
      </div>
      <LogOnSheet open={logOnOpen} onClose={() => setLogOnOpen(false)} />
      <LogOffSheet open={logOffOpen} onClose={() => setLogOffOpen(false)} />
    </>
  );
}

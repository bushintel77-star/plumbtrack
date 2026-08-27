"use client";

import { useEffect, useRef, useState } from "react";

import type { Job } from "@/types";
import { useOutboxKind } from "@/hooks/useOutboxKind";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SyncBadge } from "@/components/ui/StatusChip";
import { IconCameraField, IconHat, IconHexNut, IconNotePen } from "@/components/icons/FieldIcons";
import { IconSealCheck } from "@/components/icons/FieldIcons";

const PHOTO_LABELS = ["Before", "During", "After"] as const;

const QUICK_NOTES = [
  "Cleared blocked drain with jetter",
  "Replaced tap cartridge",
  "Repaired burst pipe",
  "Tested pressure",
  "Checked for leaks",
];

function CompletionMatrix({ state }: { state: "uploading" | "complete" }) {
  return (
    <span className={`matrix-array ${state === "uploading" ? "theme-upload" : "theme-complete"}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <span key={index} className="led" />)}
    </span>
  );
}

/**
 * Thumb-zone capture bar — the four field captures (photo, note, part,
 * safety) plus the primary completion action, all in one predictable row.
 * Every slot is a labelled ≥54px target; the photo slot carries its own
 * offline-honesty badge so queued uploads are never silent.
 */
export function CaptureBar({
  job,
  onComplete,
  onPhoto,
  onSaveNote,
  onPart,
  onSafety,
  onClockOn,
  billableActive,
  inline = false,
}: {
  job: Job;
  onComplete: () => void;
  onPhoto: (label: string) => void;
  onSaveNote: (text: string) => void;
  onPart: () => void;
  onSafety: () => void;
  onClockOn: () => void;
  billableActive: boolean;
  /** Render as an embedded block (e.g. home hero) instead of the fixed footer. */
  inline?: boolean;
}) {
  const [photoSheet, setPhotoSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [completionState, setCompletionState] = useState<"idle" | "uploading" | "complete">("idle");
  const completionTimers = useRef<number[]>([]);
  const photoSync = useOutboxKind("photo-upload");

  useEffect(() => () => {
    completionTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const completeJob = () => {
    if (!billableActive || job.photos.length === 0 || completionState !== "idle") return;
    setCompletionState("uploading");
    completionTimers.current.push(window.setTimeout(() => {
      setCompletionState("complete");
      completionTimers.current.push(window.setTimeout(onComplete, 420));
    }, 1100));
  };

  // State-driven label and helper line
  const primaryLabel = !billableActive
    ? "Clock On to Start"
    : completionState === "uploading"
      ? "Uploading proof…"
      : completionState === "complete"
        ? "Ready for sign-off"
        : "Complete & Sign";

  const helperLine = !billableActive
    ? null
    : job.photos.length === 0
      ? "Capture one completion photo to continue"
      : null;

  const primaryDisabled = !billableActive
    ? false // enabled — it's the clock-on action
    : completionState !== "idle"
      ? true
      : job.photos.length > 0 ? false : true;

  const saveNote = () => {
    const text = noteText.trim();
    if (!text) return;
    onSaveNote(text);
    setNoteText("");
    setNoteSheet(false);
  };

  return (
    <>
      <div
        className={
          inline
            ? "rounded-xl border border-line bg-fill-strong p-2"
            : "app-fixed-footer fixed bottom-0 z-20 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] app-footer backdrop-blur-md border-t"
        }
      >
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={!billableActive ? onClockOn : completeJob}
            disabled={primaryDisabled}
            aria-busy={completionState === "uploading"}
            className={`capture-complete-button flex-[1.25] min-h-[58px] rounded-xl text-on-accent text-sm font-bold flex flex-col items-center justify-center gap-0.5 disabled:opacity-35 haptic ${completionState !== "idle" ? "is-processing" : ""}`}
          >
            {completionState === "idle" ? <IconSealCheck size={20} /> : <CompletionMatrix state={completionState} />}
            {primaryLabel}
          </button>

          <CaptureSlot
            icon={<IconCameraField size={20} />}
            label="Photo"
            badge={job.photos.length === 0 ? undefined : <SyncBadge state={photoSync.state} count={photoSync.count} compact />}
            onClick={() => setPhotoSheet(true)}
            disabled={!billableActive}
          />
          <CaptureSlot
            icon={<IconNotePen size={20} />}
            label="Note"
            onClick={() => setNoteSheet(true)}
            disabled={!billableActive}
          />
          <CaptureSlot
            icon={<IconHexNut size={20} />}
            label="Part"
            badge={
              (job.serviceItems?.length ?? 0) > 0 ? (
                <span
                  className="text-2xs font-mono font-bold text-accent bg-accent-dim border border-accent-line rounded-full px-1.5 leading-4"
                  aria-label={`${job.serviceItems!.length} parts recorded`}
                >
                  {job.serviceItems!.length}
                </span>
              ) : undefined
            }
            onClick={onPart}
            disabled={!billableActive}
          />
          <CaptureSlot
            icon={<IconHat size={20} />}
            label="Safety"
            badge={
              job.safetyConfirmation &&
              (job.safetyConfirmation.waterIsolated || job.safetyConfirmation.gasChecked || job.safetyConfirmation.pressureTested) ? (
                <IconHat size={12} className="text-complete" />
              ) : undefined
            }
            onClick={onSafety}
            disabled={!billableActive}
          />
        </div>
        {helperLine && (
          <p className="text-2xs text-center text-ink-low mt-1">{helperLine}</p>
        )}
      </div>

      <BottomSheet
        open={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Photo point"
        subtitle="Label the evidence before the shutter opens"
        label="Photo label picker"
      >
        <div className="grid grid-cols-3 gap-2">
          {PHOTO_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPhotoSheet(false);
                onPhoto(label);
              }}
              className="min-h-[64px] rounded-xl border border-line bg-fill flex flex-col items-center justify-center gap-1 text-ink-mid text-xs font-bold haptic"
            >
              <IconCameraField size={20} className="text-accent" />
              {label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={noteSheet}
        onClose={() => setNoteSheet(false)}
        title="Site note"
        subtitle="Attached to the job diary — voice notes stay on the card above"
        label="Quick site note"
      >
        <div className="space-y-2.5">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What happened on site…"
            className="w-full min-h-[48px] app-input border rounded-xl px-3 text-sm"
            style={{ color: "var(--app-text)" }}
            aria-label="Site note text"
          />
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                onClick={() => setNoteText((current) => `${current}${current ? " " : ""}${note}`)}
                className="min-h-[34px] rounded-full px-3 border border-line bg-fill text-xs text-ink-low active:scale-[0.97]"
              >
                + {note}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveNote}
            disabled={!noteText.trim()}
            className="w-full min-h-[48px] rounded-xl bg-accent text-on-accent text-sm font-bold disabled:opacity-30 haptic"
          >
            Save note
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

function CaptureSlot({
  icon,
  label,
  badge,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={disabled ? `${label} — clock on required` : label}
      // Activated vs idle is a static property of scope: clocked on, the
      // slot reads powered (accent tint + family border + machined inset
      // edge); off shift, it stays flat. Label sits on one tight line —
      // the slot is sized so the longest word (SAFETY) fits without wrap.
      className={`relative w-[58px] min-h-[58px] rounded-xl border flex flex-col items-center justify-center gap-1 haptic disabled:opacity-35 disabled:cursor-not-allowed ${
        disabled
          ? "bg-fill-strong border-line text-ink-mid"
          : "bg-accent-dim border-accent-line text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
      }`}
    >
      {icon}
      <span className="text-2xs font-bold uppercase tracking-normal leading-none whitespace-nowrap px-0.5">{label}</span>
      {badge && <span className="absolute -top-1.5 -right-1.5">{badge}</span>}
    </button>
  );
}

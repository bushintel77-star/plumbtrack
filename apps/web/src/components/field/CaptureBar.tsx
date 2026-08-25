"use client";

import { useState } from "react";

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
}: {
  job: Job;
  onComplete: () => void;
  onPhoto: (label: string) => void;
  onSaveNote: (text: string) => void;
  onPart: () => void;
  onSafety: () => void;
}) {
  const [photoSheet, setPhotoSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [noteText, setNoteText] = useState("");
  const photoSync = useOutboxKind("photo-upload");

  const saveNote = () => {
    const text = noteText.trim();
    if (!text) return;
    onSaveNote(text);
    setNoteText("");
    setNoteSheet(false);
  };

  return (
    <>
      <div className="app-fixed-footer fixed bottom-0 z-20 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] app-footer backdrop-blur-md border-t">
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={onComplete}
            disabled={job.photos.length === 0}
            className="flex-[1.25] min-h-[58px] rounded-xl bg-accent text-white text-sm font-bold flex flex-col items-center justify-center gap-0.5 disabled:opacity-35 haptic"
          >
            <IconSealCheck size={19} />
            Complete &amp; sign
          </button>

          <CaptureSlot
            icon={<IconCameraField size={20} />}
            label="Photo"
            badge={job.photos.length === 0 ? undefined : <SyncBadge state={photoSync.state} count={photoSync.count} />}
            onClick={() => setPhotoSheet(true)}
          />
          <CaptureSlot
            icon={<IconNotePen size={20} />}
            label="Note"
            onClick={() => setNoteSheet(true)}
          />
          <CaptureSlot
            icon={<IconHexNut size={20} />}
            label="Part"
            badge={
              (job.serviceItems?.length ?? 0) > 0 ? (
                <span className="text-[9px] font-mono font-bold text-accent bg-accent/15 rounded-full px-1.5 leading-4">
                  {job.serviceItems!.length}
                </span>
              ) : undefined
            }
            onClick={onPart}
          />
          <CaptureSlot
            icon={<IconHat size={20} />}
            label="Safety"
            badge={
              job.safetyConfirmation &&
              (job.safetyConfirmation.waterIsolated || job.safetyConfirmation.gasChecked || job.safetyConfirmation.pressureTested) ? (
                <IconHat size={11} className="text-emerald-400" />
              ) : undefined
            }
            onClick={onSafety}
          />
        </div>
        {job.photos.length === 0 && (
          <p className="text-[10px] text-center text-slate-600 mt-1">Capture one completion photo to continue</p>
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
              className="min-h-[64px] rounded-xl border border-white/[0.1] bg-white/[0.04] flex flex-col items-center justify-center gap-1 text-slate-200 text-xs font-bold haptic"
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
                className="min-h-[34px] rounded-full px-3 border border-white/[0.08] bg-white/[0.03] text-xs text-slate-400 active:scale-[0.97]"
              >
                + {note}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveNote}
            disabled={!noteText.trim()}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-30 haptic"
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
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative w-[54px] min-h-[58px] rounded-xl bg-white/[0.06] border border-white/[0.1] text-slate-200 flex flex-col items-center justify-center gap-0.5 haptic"
    >
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      {badge && <span className="absolute -top-1.5 -right-1.5">{badge}</span>}
    </button>
  );
}

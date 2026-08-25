"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ChevronRight,
  Check,
  Clock,
  MapPin,
  Mic,
  Navigation,
  Phone,
  ShoppingCart,
  Volume2,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GlassCard } from "@/components/ui/GlassCard";
import { CaptureBar } from "@/components/field/CaptureBar";
import { OnTheWayButton } from "@/components/field/OnTheWayButton";
import { IconCameraField } from "@/components/icons/FieldIcons";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { JobActivityTimeline } from "@/components/features/JobActivityTimeline";
import type { Job, ResidentialJobType, ServiceItem, VoiceNote } from "@/types";

interface JobKit {
  id: string;
  title: string;
  hint: string;
  rate: number;
  items: { id: string; description: string; qty: number; unit: string; rate: number }[];
}

const KITS: JobKit[] = [
  {
    id: "tap-service",
    title: "Tap Service Kit",
    hint: "Cartridge, O-rings and standard labour",
    rate: 180,
    items: [
      { id: "tap-service-labour", description: "Tap service labour", qty: 1, unit: "ea", rate: 145 },
      { id: "ceramic-cartridge", description: "Ceramic disc cartridge", qty: 1, unit: "ea", rate: 35 },
      { id: "tap-o-rings", description: "Tap O-rings", qty: 1, unit: "set", rate: 0 },
    ],
  },
  {
    id: "hot-water-diagnostic",
    title: "Hot Water Diagnostic",
    hint: "Call-out and one-hour fault find",
    rate: 220,
    items: [
      { id: "hot-water-callout", description: "Hot water call-out", qty: 1, unit: "ea", rate: 85 },
      { id: "hot-water-fault-find", description: "Hot water fault find", qty: 1, unit: "hr", rate: 135 },
    ],
  },
  {
    id: "blocked-drain",
    title: "Blocked Drain Response",
    hint: "Initial jetter and drain assessment",
    rate: 295,
    items: [
      { id: "drain-callout", description: "Blocked drain call-out", qty: 1, unit: "ea", rate: 85 },
      { id: "drain-jetter", description: "Jetter and drain assessment", qty: 1, unit: "ea", rate: 210 },
    ],
  },
];

const QUICK_NOTES = [
  "Cleared blocked drain with jetter",
  "Replaced tap cartridge",
  "Repaired burst pipe",
  "Tested pressure",
  "Checked for leaks",
];

const TYPE_LABELS: Record<ResidentialJobType, string> = {
  emergency: "Emergency",
  hot_water: "Hot Water",
  general_maintenance: "General Maintenance",
  gas_compliance: "Gas Compliance",
  blocked_drain: "Blocked Drain",
};

function jobTypeLabel(job: Job): string {
  if (job.jobType) return TYPE_LABELS[job.jobType];
  if (/hot water/i.test(job.scope)) return "Hot Water";
  if (/burst pipe|emergency|riser|urgent/i.test(job.scope)) return "Emergency";
  if (/blocked|drain/i.test(job.scope)) return "Blocked Drain";
  return "General Maintenance";
}

function destinationUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResult) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

function VoiceCaptureButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const supported = typeof window !== "undefined" && !!((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggle = () => {
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported}
      aria-label="Record voice note"
      title={supported ? "Record voice note" : "Voice notes are not supported in this browser"}
      className={`w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center transition haptic ${listening ? "bg-accent/20 border-accent/40 text-accent" : "bg-white/[0.05] border-white/[0.1] text-slate-300"} disabled:opacity-35`}
    >
      <Mic size={19} />
    </button>
  );
}

function TypeBadge({ job }: { job: Job }) {
  const label = jobTypeLabel(job);
  const emergency = label === "Emergency";
  return <span className={`inline-flex items-center min-h-[28px] rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider border ${emergency ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-accent/12 text-accent border-accent/25"}`}>{label}</span>;
}

function ItemRow({ item, onQty, onRemove }: { item: ServiceItem; onQty: (qty: number) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 min-h-[44px] border-b border-white/[0.06] last:border-0">
      <div className="flex-1 min-w-0"><p className="text-sm text-slate-200 truncate">{item.description}</p><p className="text-[10px] text-slate-500">${item.rate.toFixed(2)} / {item.unit}</p></div>
      <button type="button" onClick={() => onQty(item.qty - 1)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-300" aria-label={`Decrease ${item.description}`}>−</button>
      <span className="w-5 text-center text-xs font-mono text-white">{item.qty}</span>
      <button type="button" onClick={() => onQty(item.qty + 1)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-300" aria-label={`Increase ${item.description}`}>+</button>
      <button type="button" onClick={onRemove} className="w-7 h-7 rounded-md text-slate-500 hover:text-red-300" aria-label={`Remove ${item.description}`}><X size={14} /></button>
    </div>
  );
}

export function ResidentialJobView({ job, billedSeconds, onClockPress, onSwitchStaff }: { job: Job; billedSeconds: number; onClockPress: () => void; onSwitchStaff: () => void }) {
  const { addPhoto, setView, dispatch, currentStaff, currentStaffName, members, syncStatus } = usePlumbTrackCtx();
  const online = useOnlineStatus();
  const [kitOpen, setKitOpen] = useState(false);
  const [safetySheet, setSafetySheet] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [pendingPhotoLabel, setPendingPhotoLabel] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const items = job.serviceItems ?? [];
  const voiceNotes = job.voiceNotes ?? [];
  const safety = job.safetyConfirmation ?? { waterIsolated: false, gasChecked: false, pressureTested: false, notes: "" };
  const itemTotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);

  const addKit = (kit: JobKit) => {
    for (const kitItem of kit.items) {
      const existing = items.find((item) => item.id === kitItem.id);
      if (existing) dispatch({ type: "UPDATE_SERVICE_ITEM_QTY", jobId: job.id, itemId: existing.id, qty: existing.qty + kitItem.qty });
      else dispatch({ type: "ADD_SERVICE_ITEM", jobId: job.id, item: { ...kitItem, source: "kit" } });
    }
    setKitOpen(false);
  };

  const addQuickNote = (text: string) => {
    const next = `${voiceText}${voiceText ? " " : ""}${text}`;
    setVoiceText(next);
  };

  const saveVoiceNote = () => {
    const transcript = voiceText.trim();
    if (!transcript) return;
    const note: VoiceNote = { id: crypto.randomUUID(), transcript, createdAt: new Date().toISOString(), createdBy: currentStaff?.id ?? "tim" };
    dispatch({ type: "ADD_VOICE_NOTE", jobId: job.id, note });
    setVoiceText("");
  };

  const openCamera = (label: string) => { setPendingPhotoLabel(label); cameraInputRef.current?.click(); };
  const onCameraCapture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingPhotoLabel) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") addPhoto(pendingPhotoLabel, reader.result); };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateSafety = (key: keyof typeof safety) => {
    if (key === "notes") return;
    dispatch({ type: "SET_SAFETY_CONFIRMATION", jobId: job.id, confirmation: { ...safety, [key]: !safety[key] } });
  };

  return (
    <div className="p-3 pb-28 space-y-2">
      <GlassCard className="!p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5"><TypeBadge job={job} /><span className="text-[10px] text-slate-500 font-mono">{job.id}</span></div>
            <p className="text-lg font-bold text-white truncate">{job.client}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin size={12} /> {job.address}</p>
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{job.scope}</p>
          </div>
          <button type="button" onClick={onSwitchStaff} className="shrink-0 flex flex-col items-center gap-1" aria-label={`Working as ${currentStaffName} — tap to switch`}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: currentStaff?.color ?? "#64748b" }}>{currentStaffName.slice(0, 2).toUpperCase()}</span>
            <span className="text-[9px] text-slate-500 font-bold uppercase">{currentStaffName}</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <a href={job.phone ? `tel:${job.phone}` : undefined} aria-disabled={!job.phone} className={`min-h-[48px] rounded-xl flex items-center justify-center gap-2 border text-sm font-semibold transition haptic ${job.phone ? "bg-white/[0.06] text-white border-white/[0.1]" : "bg-white/[0.03] text-slate-600 border-white/[0.06] pointer-events-none"}`}><Phone size={16} /> Call client</a>
          <a href={destinationUrl(job.address)} target="_blank" rel="noreferrer" className="min-h-[48px] rounded-xl flex items-center justify-center gap-2 bg-accent text-white text-sm font-semibold transition haptic"><Navigation size={16} /> Navigate</a>
        </div>
        {job.status !== "completed" && <OnTheWayButton jobId={job.id} />}
        {job.accessCode && <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><span className="text-accent font-semibold">Access</span><span>{job.accessCode}</span></div>}
      </GlassCard>

      <div className="surface-card p-4">
        <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent animate-pulse" /><span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">On site timer</span></div><span className="text-xs text-slate-500">GPS check-in</span></div>
        <div className="flex items-center justify-between gap-3"><p className="text-4xl font-mono tabular-nums text-white">{formatClock(billedSeconds)}</p><button type="button" onClick={onClockPress} className="min-h-[52px] px-4 rounded-xl bg-accent text-white text-sm font-bold flex items-center gap-2 haptic"><Clock size={17} /> Clock {job.timeEntries.some((entry) => entry.staffId === currentStaff?.id && entry.end === null) ? "off" : "on"}</button></div>
      </div>

      <JobActivityTimeline job={job} members={members} online={online} syncStatus={syncStatus} />

      <GlassCard>
        <div className="flex items-center justify-between mb-2"><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Photo proof</p><p className="text-[11px] text-slate-600 mt-0.5">Timestamped before and after evidence</p></div><span className="text-xs text-slate-500">{job.photos.length} saved</span></div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(["Before", "After"] as const).map((label) => <button key={label} type="button" onClick={() => openCamera(label)} className="min-h-[92px] rounded-xl border border-dashed border-white/[0.14] bg-white/[0.03] text-slate-300 flex flex-col items-center justify-center gap-1.5 haptic"><IconCameraField size={21} className="text-accent" /><span className="text-xs font-semibold">{label} photo</span><span className="text-[10px] text-slate-600">Open camera</span></button>)}
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {job.photos.slice(-5).map((photo) => <div key={photo.id} className="w-14 h-14 shrink-0 rounded-lg surface-inset overflow-hidden relative">{photo.url && <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />}<span className="absolute inset-x-0 bottom-0 bg-black/60 text-[8px] text-center text-white">{photo.label}</span></div>)}
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onCameraCapture} className="hidden" />
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-2"><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job diary</p><p className="text-[11px] text-slate-600 mt-0.5">Quick note or dictate while your hands are busy</p></div><Volume2 size={16} className="text-accent" /></div>
        <div className="flex gap-2"><VoiceCaptureButton onTranscript={(text) => setVoiceText((current) => `${current}${current ? " " : ""}${text}`)} /><input value={voiceText} onChange={(event) => setVoiceText(event.target.value)} placeholder="Voice note transcript" className="min-w-0 flex-1 min-h-[48px] app-input border rounded-xl px-3 text-sm text-white placeholder-slate-600" /><button type="button" onClick={saveVoiceNote} disabled={!voiceText.trim()} className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-30" aria-label="Save voice note"><Check size={18} /></button></div>
        <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1">{QUICK_NOTES.map((note) => <button key={note} type="button" onClick={() => addQuickNote(note)} className="shrink-0 min-h-[34px] rounded-full px-3 border border-white/[0.08] bg-white/[0.03] text-xs text-slate-400 active:scale-[0.97]">+ {note}</button>)}</div>
        {voiceNotes.slice(-3).map((note) => <div key={note.id} className="mt-2 flex gap-2 text-xs text-slate-400"><Mic size={13} className="text-accent shrink-0 mt-0.5" /><span>{note.transcript}</span></div>)}
      </GlassCard>

      <div style={{ scrollMarginBottom: "128px" }}>
      <GlassCard>
        <div className="flex items-center justify-between mb-2"><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing & materials</p><p className="text-[11px] text-slate-600 mt-0.5">Use the Part slot in the capture bar to add a preset kit</p></div><ShoppingCart size={17} className="text-accent" /></div>
        {items.length === 0 ? <div className="min-h-[48px] rounded-xl border border-dashed border-white/[0.1] flex items-center justify-center text-xs text-slate-600">No items added yet</div> : <div>{items.map((item) => <ItemRow key={item.id} item={item} onQty={(qty) => dispatch({ type: "UPDATE_SERVICE_ITEM_QTY", jobId: job.id, itemId: item.id, qty })} onRemove={() => dispatch({ type: "REMOVE_SERVICE_ITEM", jobId: job.id, itemId: item.id })} />)}</div>}
        <div className="flex justify-between pt-2 mt-1 border-t border-white/[0.06] text-sm font-bold text-white"><span>Items total</span><span>${itemTotal.toFixed(2)}</span></div>
      </GlassCard>
      </div>

      <BottomSheet open={kitOpen} onClose={() => setKitOpen(false)} title="Add service item" subtitle="Preset rates and repair kits for fast driveway pricing" label="Service item picker">
        <div className="space-y-2">{KITS.map((kit) => <button key={kit.id} type="button" onClick={() => addKit(kit)} className="w-full min-h-[72px] rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-left flex items-center gap-3 haptic"><span className="w-10 h-10 shrink-0 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><ShoppingCart size={18} /></span><span className="flex-1 min-w-0"><span className="block text-sm font-bold text-white">{kit.title}</span><span className="block text-xs text-slate-500 mt-0.5">{kit.hint}</span></span><span className="text-sm font-bold text-accent">${kit.rate}</span><ChevronRight size={16} className="text-slate-600" /></button>)}</div>
      </BottomSheet>

      <BottomSheet open={safetySheet} onClose={() => setSafetySheet(false)} title="Safety confirmation" subtitle="Record the checks relevant to this repair" label="Safety confirmation">
        <div className="space-y-1.5">{([{ key: "waterIsolated", label: "Water isolated before work" }, { key: "gasChecked", label: "Gas appliance / line checked" }, { key: "pressureTested", label: "Pressure or function tested" }] as const).map((check) => <button key={check.key} type="button" onClick={() => updateSafety(check.key)} className="w-full min-h-[52px] flex items-center gap-2.5 text-left text-sm text-slate-300"><span className={`w-6 h-6 rounded-md border flex items-center justify-center ${safety[check.key] ? "bg-accent border-accent text-white" : "border-white/[0.14]"}`}>{safety[check.key] && <Check size={15} />}</span>{check.label}</button>)}</div>
      </BottomSheet>

      <CaptureBar
        job={job}
        onComplete={() => setView("signoff")}
        onPhoto={openCamera}
        onSaveNote={(text) => dispatch({ type: "ADD_VOICE_NOTE", jobId: job.id, note: { id: crypto.randomUUID(), transcript: text, createdAt: new Date().toISOString(), createdBy: currentStaff?.id ?? "tim" } })}
        onPart={() => setKitOpen(true)}
        onSafety={() => setSafetySheet(true)}
      />
    </div>
  );
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

"use client";

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle, Check, Cloud, LoaderCircle, MapPin, Mic, Package, Plus, Send, Users, Wrench, X } from "lucide-react";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { GlassCard } from "@/components/ui/GlassCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatDuration } from "@/lib/billing";
import { formatSerial } from "@/lib/display";
import { captureEvidenceCoordinates } from "@/lib/geolocation";
import type { DailyReport, Job, LogEntry, ReportMaterial } from "@/types";

const WORK_CHIPS = [
  "Repaired leak",
  "Replaced cartridge",
  "Rerouted pipe",
  "Pressure tested",
  "Installed fittings",
  "Made site safe",
];

const COMMON_MATERIALS = [
  { id: "common-cartridge", description: "Mixer cartridge", unit: "ea", rate: 0 },
  { id: "common-pvc", description: "100mm PVC pipe", unit: "m", rate: 0 },
  { id: "common-ptfe", description: "PTFE tape", unit: "ea", rate: 0 },
  { id: "common-silicone", description: "Silicone sealant", unit: "ea", rate: 0 },
  { id: "common-fittings", description: "Pipe fittings", unit: "ea", rate: 0 },
];

function localDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayStr(): string {
  return localDate(new Date());
}

function isCommercialScope(scope: string): boolean {
  return /commercial|body corp|body corporate|riser|insurer|fitout|construction|project|site works|multi[- ]day/i.test(scope);
}

/** Full daily reporting is valuable on project work, but unnecessary for a one-off service call. */
export function requiresDailyReport(job: Job): boolean {
  const workDays = new Set(job.timeEntries.map((entry) => localDate(entry.start)));
  return isCommercialScope(job.scope) || workDays.size > 1;
}

function deriveCrewIds(job: Job, date: string): string[] {
  return [...new Set(
    job.timeEntries
      .filter((entry) => entry.end === null || localDate(entry.start) === date)
      .map((entry) => entry.staffId),
  )];
}

function buildReport(job: Job): DailyReport {
  const date = todayStr();
  const existing = job.dailyReports.find((report) => report.date === date);
  if (existing) return existing;

  const productionEntries = job.logEntries
    .filter((entry) => localDate(entry.createdAt) === date && entry.kind === "production")
    .map((entry) => entry.id);

  return {
    id: `dr-${date}-${job.id}`,
    jobId: job.id,
    date,
    weather: "",
    crewIds: deriveCrewIds(job, date),
    workCompleted: "",
    materialsUsed: "",
    materials: [],
    delays: "",
    visitorLog: "",
    productionEntries,
    checklistIds: [],
    photoIds: [],
    submittedAt: null,
  };
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  return "Storms";
}

type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResult) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function VoiceMatrix() {
  return (
    <span className="matrix-array theme-mic" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <span key={index} className="led" />)}
    </span>
  );
}

function VoiceButton({ onText, label, modulator = false }: { onText: (text: string) => void; label: string; modulator?: boolean }) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<"idle" | "unsupported" | "error">("idle");
  const recognitionRef = useRef<Recognition | null>(null);
  const statusId = useId();
  const supported = typeof window !== "undefined" && !!((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);

  const toggle = () => {
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus("unsupported");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setStatus("idle");
      return;
    }

    const recognition = new Constructor();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onText(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setStatus("error");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setStatus("idle");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setStatus("error");
    }
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const statusMessage = listening
    ? `Listening for ${label}. Speak now.`
    : status === "unsupported"
      ? "Voice input is not supported on this browser. Type your note instead."
      : status === "error"
        ? "Voice input could not start. Type your note instead."
        : "";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? `Stop voice input for ${label}` : `Dictate ${label}`}
        aria-pressed={listening}
        aria-busy={listening}
        aria-describedby={statusId}
        title={supported ? `Dictate ${label}` : "Voice input is not supported on this browser; type your note instead"}
        className={`daily-report-voice-button inline-flex items-center justify-center w-9 h-9 rounded-lg border transition haptic ${
          listening ? "bg-accent/20 text-accent border-accent/40" : "bg-fill text-ink-low border-line"
        } ${modulator ? "is-modulator" : ""} ${listening ? "is-listening" : ""}`}
      >
        {modulator && listening ? <VoiceMatrix /> : <Mic size={15} />}
      </button>
      <span id={statusId} className="sr-only" aria-live="polite">{statusMessage}</span>
    </>
  );
}

function FieldLabel({ icon, children, voice }: { icon: ReactNode; children: ReactNode; voice?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <p className="text-xs font-bold text-ink-low uppercase tracking-wider flex items-center gap-1.5">
        {icon} {children}
      </p>
      {voice}
    </div>
  );
}

function MaterialPicker({
  open,
  onClose,
  options,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  options: { id: string; description: string; unit: string; rate: number; quoteLineId?: string }[];
  onAdd: (option: { id: string; description: string; unit: string; rate: number; quoteLineId?: string }) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <BottomSheet open={open} onClose={onClose} title="Log material" subtitle="Use a quoted item or add a field item" label="Add material">
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => { onAdd(option); onClose(); }}
            className="text-left min-h-[56px] rounded-xl border border-line bg-fill px-3 py-2.5 text-ink text-sm font-semibold active:scale-[0.97] transition"
          >
            <span className="block truncate">{option.description}</span>
            <span className="block text-[11px] text-ink-low mt-0.5">per {option.unit}{option.rate ? ` · $${option.rate}` : ""}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-line">
        <label className="text-xs font-bold text-ink-low uppercase tracking-wider block mb-1.5">Custom item</label>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="e.g. isolation valve"
            className="min-w-0 flex-1 min-h-[48px] app-input border rounded-xl px-3 text-sm text-ink placeholder-ink-low"
          />
          <button
            type="button"
            disabled={!custom.trim()}
            onClick={() => { onAdd({ id: `custom-${crypto.randomUUID()}`, description: custom.trim(), unit: "ea", rate: 0 }); setCustom(""); onClose(); }}
            className="min-h-[48px] px-4 rounded-xl bg-accent text-on-accent font-semibold text-sm disabled:opacity-35"
          >Add</button>
        </div>
      </div>
    </BottomSheet>
  );
}

export function DailyReportView() {
  const { job } = usePlumbTrackCtx();
  if (!job) return null;
  return <DailyReportForm job={job} />;
}

function DailyReportForm({ job }: { job: Job }) {
  const { members, quotes, dispatch, postMessage, setView, currentStaffId } = usePlumbTrackCtx();
  const [weather, setWeather] = useState("");
  const [weatherEdited, setWeatherEdited] = useState(false);
  const [weatherState, setWeatherState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [workDone, setWorkDone] = useState("");
  const [selectedWork, setSelectedWork] = useState<string[]>([]);
  const [materials, setMaterials] = useState<ReportMaterial[]>([]);
  const [delays, setDelays] = useState("");
  const [visitors, setVisitors] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const report = useMemo(() => buildReport(job), [job]);
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const originQuote = job.quoteId ? quotes.find((quote) => quote.id === job.quoteId) : undefined;
  const materialOptions = useMemo(() => {
    const quoted = (originQuote?.lines ?? [])
      .filter((line) => line.unit !== "hr" && !/call.?out/i.test(line.desc))
      .map((line) => ({ id: `quote-${line.id}`, quoteLineId: line.id, description: line.desc, unit: line.unit, rate: line.rate }));
    return [...quoted, ...COMMON_MATERIALS.filter((common) => !quoted.some((item) => item.description.toLowerCase() === common.description.toLowerCase()))];
  }, [originQuote]);

  // Load an existing draft once when the active report changes.
  useEffect(() => {
    const legacyMaterial = report.materials?.length
      ? report.materials
      : report.materialsUsed
        ? [{ id: "legacy-material", description: report.materialsUsed, qty: 1, unit: "ea", rate: 0 }]
        : [];
    setWeather(report.weather);
    setWeatherEdited(Boolean(report.weather));
    setSaving(false);
    setWorkDone(report.workCompleted);
    setSelectedWork([]);
    setMaterials(legacyMaterial);
    setDelays(report.delays);
    setVisitors(report.visitorLog);
    setSubmitted(Boolean(report.submittedAt));
    setSaved(false);
  }, [report.id, report.delays, report.materials, report.materialsUsed, report.submittedAt, report.visitorLog, report.weather, report.workCompleted]);

  // Auto-fill weather from the device's location. Open-Meteo is keyless and
  // provides a reliable field-friendly fallback when BOM data is unavailable.
  useEffect(() => {
    if (weatherEdited) return;
    let cancelled = false;
    const unavailable = () => { if (!cancelled) setWeatherState("unavailable"); };
    if (!navigator.geolocation) { unavailable(); return () => { cancelled = true; }; }

    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error("weather request failed");
        const data = await response.json() as { current?: { temperature_2m?: number; weather_code?: number } };
        if (cancelled || data.current?.temperature_2m === undefined || data.current.weather_code === undefined) return unavailable();
        setWeather(`${weatherLabel(data.current.weather_code)} · ${Math.round(data.current.temperature_2m)}°C`);
        setWeatherState("ready");
      } catch { unavailable(); }
    }, unavailable, { enableHighAccuracy: false, timeout: 5000, maximumAge: 300_000 });

    return () => { cancelled = true; };
  }, [report.id, weatherEdited]);

  const crewIds = useMemo(() => deriveCrewIds(job, report.date), [job, report.date]);
  const todayLogs = useMemo(
    () => job.logEntries.filter((entry: LogEntry) => localDate(entry.createdAt) === report.date),
    [job.logEntries, report.date],
  );
  const isSubmitted = submitted || report.submittedAt !== null;
  const workSummary = [...selectedWork, workDone.trim()].filter(Boolean).join(" · ");
  const materialTotal = materials.reduce((sum, item) => sum + item.qty * item.rate, 0);

  const updateText = (setter: Dispatch<SetStateAction<string>>, value: string) => setter((current) => `${current}${current ? " " : ""}${value}`);

  const addMaterial = (option: { id: string; description: string; unit: string; rate: number; quoteLineId?: string }) => {
    setMaterials((current) => {
      const existing = current.find((item) => item.id === option.id);
      if (existing) return current.map((item) => item.id === option.id ? { ...item, qty: item.qty + 1 } : item);
      return [...current, { id: option.id, description: option.description, qty: 1, unit: option.unit, rate: option.rate, quoteLineId: option.quoteLineId }];
    });
  };

  const saveReport = async (submit: boolean) => {
    if (saving || (submit && isSubmitted)) return;
    setSaving(true);
    const submittedAt = submit ? new Date().toISOString() : null;
    const coords = submit ? await captureEvidenceCoordinates() : null;
    const nextReport: DailyReport = {
      ...report,
      crewIds,
      weather: weather.trim(),
      workCompleted: workSummary,
      materialsUsed: materials.map((item) => `${item.qty} ${item.unit} ${item.description}`).join(", "),
      materials,
      delays: delays.trim(),
      visitorLog: visitors.trim(),
      submittedBy: submit ? currentStaffId : report.submittedBy ?? null,
      submittedLat: submit ? coords?.lat ?? null : report.submittedLat ?? null,
      submittedLng: submit ? coords?.lng ?? null : report.submittedLng ?? null,
      submittedAt,
    };
    dispatch({ type: "ADD_DAILY_REPORT", jobId: job.id, report: nextReport });
    setSaved(!submit);
    setSubmitted(submit);
    setSaving(false);

    if (submit) {
      const crewNames = crewIds.map((id) => memberMap.get(id)?.name.split(" ")[0] ?? id).join(", ") || "No crew recorded";
      postMessage("field-updates", "plumbtrack", `📋 **Daily Report — ${formatSerial(job.id)} (${report.date})**\n> Work: ${workSummary || "No work summary"}\n> Crew: ${crewNames}\n> Materials: ${nextReport.materialsUsed || "None logged"}\n> Weather: ${weather || "Not available"}`);
    }
  };

  if (!requiresDailyReport(job)) {
    return (
      <div className="p-3">
        <GlassCard className="text-center">
          <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto mb-2"><Check size={20} /></div>
          <p className="font-semibold text-ink">Quick service job</p>
          <p className="text-xs text-ink-low mt-1">Use Clock, Photos, and Sign-off for this callout. A full daily report is reserved for project work.</p>
          <button type="button" onClick={() => setView("job")} className="mt-4 w-full min-h-[48px] rounded-xl bg-accent text-on-accent font-semibold text-sm">Back to job</button>
        </GlassCard>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="p-3 space-y-2">
        <GlassCard className="text-center">
          <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto mb-1.5"><Check size={20} /></div>
          <p className="font-semibold text-ink">Daily Report Submitted</p>
          <p className="text-xs text-ink-low mt-0.5">{report.date} · posted to #field-updates</p>
          <button type="button" onClick={() => setView("job")} className="mt-4 w-full min-h-[48px] rounded-xl surface-card text-ink-mid text-sm font-semibold border border-line">Back to job</button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="daily-report-screen p-3 pb-28 space-y-2">
      <GlassCard className="!p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-accent">Field log · {report.date}</p>
            <p className="text-sm font-semibold text-ink truncate">{job.client}</p>
            <p className="text-xs text-ink-low flex items-center gap-1 mt-0.5"><MapPin size={11} /> {job.address}</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase text-ink-low border border-line rounded-full px-2 py-1">Project mode</span>
        </div>
      </GlassCard>

      <GlassCard>
        <FieldLabel icon={<Users size={13} />}>Crew on site</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {crewIds.map((id) => {
            const member = memberMap.get(id);
            const seconds = job.timeEntries.filter((entry) => entry.staffId === id && (entry.end === null || localDate(entry.start) === report.date)).reduce((sum, entry) => sum + (entry.end ? (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 1000 : (Date.now() - new Date(entry.start).getTime()) / 1000), 0);
            return <span key={id} className="inline-flex items-center gap-1.5 min-h-[36px] rounded-full bg-accent/10 border border-accent/25 px-3 text-xs text-accent font-semibold"><span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px]">{(member?.name ?? id).slice(0, 2).toUpperCase()}</span>{member?.name.split(" ")[0] ?? id} · {formatDuration(Math.max(0, Math.floor(seconds)))}</span>;
          })}
          {crewIds.length === 0 && <span className="text-xs text-ink-low">No one clocked on yet. Crew appears automatically from this job’s time entries.</span>}
        </div>
      </GlassCard>

      <GlassCard>
        <FieldLabel icon={<Cloud size={13} />}>Weather</FieldLabel>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input value={weather} onChange={(event) => { setWeatherEdited(true); setWeather(event.target.value); }} placeholder={weatherState === "loading" ? "Reading local weather…" : "Weather unavailable — tap to add"} className="daily-report-input w-full min-h-[44px] app-input border rounded-xl px-3 text-sm text-ink placeholder-ink-low" />
            {weatherState === "loading" && <LoaderCircle size={14} className="absolute right-3 top-3.5 text-ink-low animate-spin" />}
          </div>
          <span className="text-[10px] text-ink-low whitespace-nowrap">GPS / live</span>
        </div>
      </GlassCard>

      <GlassCard>
        <FieldLabel icon={<Wrench size={13} />} voice={<VoiceButton modulator label="work completed" onText={(text) => updateText(setWorkDone, text)} />}>
          Work completed
        </FieldLabel>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {WORK_CHIPS.map((chip) => {
            const active = selectedWork.includes(chip);
            return <button key={chip} type="button" onClick={() => setSelectedWork((current) => active ? current.filter((item) => item !== chip) : [...current, chip])} className={`daily-report-toggle min-h-[36px] rounded-full border px-3 text-xs font-semibold transition active:scale-[0.97] ${active ? "is-active" : ""}`}>{active ? "✓ " : "+ "}{chip}</button>;
          })}
        </div>
        <textarea value={workDone} onChange={(event) => setWorkDone(event.target.value)} placeholder="Add a short note or use the mic" rows={2} className="daily-report-input w-full app-input border rounded-xl px-3 py-2.5 text-sm text-ink placeholder-ink-low resize-none" />
        {todayLogs.filter((entry) => entry.kind === "production").map((entry) => <p key={entry.id} className="text-xs text-ink-low mt-2">• {entry.description}{entry.quantity ? ` · ${entry.quantity}${entry.unit ?? ""}` : ""}</p>)}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-1.5">
          <FieldLabel icon={<Package size={13} />}>Materials used</FieldLabel>
          <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1 min-h-[36px] rounded-lg bg-accent/15 text-accent border border-accent/25 px-2.5 text-xs font-bold"><Plus size={13} /> Add item</button>
        </div>
        {materials.length === 0 ? <p className="text-xs text-ink-low py-2">No materials logged. Add quoted items or choose a common field item.</p> : <div className="space-y-1.5">
          {materials.map((item) => <div key={item.id} className="flex items-center gap-2 min-h-[40px] rounded-lg bg-fill border border-line px-2.5"><span className="flex-1 min-w-0 text-sm text-ink-mid truncate">{item.description}</span><button type="button" onClick={() => setMaterials((current) => current.map((entry) => entry.id === item.id ? { ...entry, qty: Math.max(1, entry.qty - 1) } : entry))} className="w-7 h-7 rounded-md bg-fill-strong text-ink-mid">−</button><span className="w-5 text-center text-xs font-mono text-ink">{item.qty}</span><button type="button" onClick={() => setMaterials((current) => current.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry))} className="w-7 h-7 rounded-md bg-fill-strong text-ink-mid">+</button><button type="button" onClick={() => setMaterials((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.description}`} className="w-7 h-7 rounded-md text-ink-low hover:text-urgent"><X size={14} /></button></div>)}
          {materialTotal > 0 && <p className="text-[11px] text-ink-low text-right pt-1">Quoted value logged · ${materialTotal.toFixed(2)}</p>}
        </div>}
      </GlassCard>

      <GlassCard>
        <FieldLabel icon={<AlertTriangle size={13} />} voice={<VoiceButton label="delays and issues" onText={(text) => updateText(setDelays, text)} />}>Issues / delays <span className="font-normal normal-case tracking-normal text-ink-low">optional</span></FieldLabel>
        <textarea value={delays} onChange={(event) => setDelays(event.target.value)} placeholder="Only add something if it needs follow-up" rows={2} className="daily-report-input w-full app-input border rounded-xl px-3 py-2.5 text-sm text-ink placeholder-ink-low resize-none" />
      </GlassCard>

      <GlassCard className="!p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-ink-low"><span>Visitors are optional for this log</span><button type="button" onClick={() => setVisitors((current) => current ? "" : "Visitor recorded") } className={`min-h-[36px] px-3 rounded-full border font-semibold ${visitors ? "bg-accent/10 border-accent/25 text-accent" : "border-line text-ink-low"}`}>{visitors ? "Visitor added" : "Add visitor"}</button></div>
        {visitors && <input autoFocus value={visitors} onChange={(event) => setVisitors(event.target.value)} placeholder="Name or company" className="daily-report-input mt-2 w-full min-h-[44px] app-input border rounded-xl px-3 text-sm text-ink placeholder-ink-low" />}
      </GlassCard>

      <MaterialPicker open={pickerOpen} onClose={() => setPickerOpen(false)} options={materialOptions} onAdd={addMaterial} />

      <div className="daily-report-action-bar app-fixed-footer fixed bottom-0 z-20 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] app-footer border-t">
        <div className="flex gap-2">
          <button type="button" onClick={() => { void saveReport(false); }} disabled={saving} className="daily-report-save flex-1 min-h-[56px] rounded-xl border text-ink-mid text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50">{saving && !submitted ? "Saving…" : saved ? "Draft saved" : "Save draft"}</button>
          <button type="button" onClick={() => { void saveReport(true); }} disabled={saving || !workSummary.trim()} className="daily-report-submit flex-[1.35] min-h-[56px] rounded-xl text-on-accent text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-35 active:scale-[0.98] transition"><Send size={15} /> Submit log</button>
        </div>
      </div>
    </div>
  );
}

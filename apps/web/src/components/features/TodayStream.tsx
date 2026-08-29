"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";

import type { Job } from "@/types";
import { derivedJobStatus } from "@/lib/billing";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { useTimer } from "@/hooks/useTimer";
import { formatSerial, formatSerialWithHash, localDateStr } from "@/lib/display";
import { StatusChip } from "@/components/ui/StatusChip";
import { SwipeableCard } from "@/components/ui/SwipeableCard";
import { Avatar } from "@/components/ui/Avatar";
import { ShiftCard } from "@/components/shift/ShiftCard";
import { CaptureBar } from "@/components/field/CaptureBar";
import {
  IconCameraField,
  IconHexNut,
  IconKeyAccess,
  IconNotePen,
} from "@/components/icons/FieldIcons";
import { Camera, CheckCircle2, ClipboardList, Clock, MapPin, MessageSquare, Navigation, Phone, ShieldAlert } from "lucide-react";
import { expiryState } from "@/lib/documents";
import { FieldChatSurface } from "@/components/messages/FieldChatSurface";

export function TodayStream() {
  const {
    jobs, messages, channels, members, documents,
    openJob, openChannel, startClockOn, currentStaffId, currentStaff,
    setActiveId, setView, setActiveTab,
    unreadByChannel, totalUnread,
    addPhoto, dispatch, pendingSyncCount,
  } = usePlumbTrackCtx();
  const { activeShift } = usePlumbTrackCtx();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in_progress" | "scheduled" | "completed">("all");
  const [pendingPhotoLabel, setPendingPhotoLabel] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const today = localDateStr();
  const active = useMemo(() => jobs.filter((j) => derivedJobStatus(j) === "in_progress"), [jobs]);
  const scheduled = useMemo(() => jobs.filter((j) => derivedJobStatus(j) === "scheduled")
    .sort((a, b) => Number(b.jobType === "emergency") - Number(a.jobType === "emergency")), [jobs]);
  const focusEntry = useMemo(() => {
    const focus = jobs.find((j) => j.timeEntries.some((e) => e.staffId === currentStaffId && e.end === null));
    return focus ? (focus.timeEntries.find((e) => e.staffId === currentStaffId && e.end === null) ?? null) : null;
  }, [jobs, currentStaffId]);
  const focusJob = useMemo(() => jobs.find((j) => j.timeEntries.some((e) => e.staffId === currentStaffId && e.end === null)) ?? active[0] ?? scheduled[0] ?? null, [jobs, active, scheduled, currentStaffId]);
  const focusIsLive = !!focusJob && focusJob.timeEntries.some((e) => e.staffId === currentStaffId && e.end === null);
  const focusEntryStale = !!focusEntry && Date.now() - new Date(focusEntry.start).getTime() > 12 * 60 * 60 * 1000;

  const openCamera = (label: string) => { setPendingPhotoLabel(label); cameraInputRef.current?.click(); };
  const onCameraCapture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingPhotoLabel || !focusJob) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") addPhoto(pendingPhotoLabel, reader.result, focusJob.id); };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const duties = useMemo(() => {
    const items: { id: string; icon: typeof Camera; tone: "warn" | "info"; text: string; act: () => void }[] = [];
    if (focusEntryStale && focusJob) {
      const since = new Date(focusEntry!.start);
      items.push({ id: "stale-entry", icon: Clock, tone: "warn", text: `Still clocked on since ${since.toLocaleDateString("en-AU", { weekday: "short" })} ${since.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} — review the time entry`, act: () => openJob(focusJob.id) });
    }
    if (focusJob) {
      if (!focusJob.dailyReports.some((r) => r.date === today && r.submittedAt)) items.push({ id: "report", icon: ClipboardList, tone: "warn", text: `Daily report due — ${formatSerial(focusJob.id)}`, act: () => { setActiveId(focusJob.id); setView("dailyReport"); } });
      if ((focusJob.photos?.length ?? 0) === 0) items.push({ id: "photos", icon: Camera, tone: "warn", text: "No photo evidence on this job yet", act: () => openJob(focusJob.id) });
    }
    const atRisk = documents.filter((d) => { const state = expiryState(d.expiresOn); return state === "expired" || state === "soon"; });
    if (atRisk.length > 0) items.push({ id: "compliance", icon: ShieldAlert, tone: "warn", text: `${atRisk.length} compliance document${atRisk.length > 1 ? "s" : ""} need attention`, act: () => setActiveTab("documents") });
    return items;
  }, [focusJob, focusEntry, focusEntryStale, documents, today, openJob, setActiveId, setView, setActiveTab]);

  const comms = useMemo(() => messages.filter((m) => m.authorId !== currentStaffId && (unreadByChannel[m.channelId] ?? 0) > 0)
    .sort((a, b) => { const aBot = members.find((mem) => mem.id === a.authorId)?.role === "bot"; const bBot = members.find((mem) => mem.id === b.authorId)?.role === "bot"; if (aBot !== bBot) return aBot ? 1 : -1; return new Date(b.ts).getTime() - new Date(a.ts).getTime(); })
    .slice(0, 3)
    .map((m) => { const member = members.find((mem) => mem.id === m.authorId); return { ...m, channel: channels.find((c) => c.id === m.channelId), author: member?.name.split(" ")[0] ?? "Team", authorName: member?.name ?? "Team", authorColor: member?.color }; }),
    [messages, channels, members, currentStaffId, unreadByChannel]);

  const counts = useMemo(() => ({ all: jobs.length, active: active.length, scheduled: scheduled.length, completed: jobs.filter((j) => derivedJobStatus(j) === "completed").length }), [jobs, active, scheduled]);
  const filtered = useMemo(() => jobs.filter((j) => { const status = derivedJobStatus(j); if (filter !== "all" && status !== filter) return false; if (!search.trim()) return true; const q = search.toLowerCase(); return j.client.toLowerCase().includes(q) || j.address.toLowerCase().includes(q) || j.id.toLowerCase().includes(q); }), [jobs, search, filter]);

  return (
    <div className="mobile-page-shell" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <ShiftCard />
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}><div className="flex-1 min-w-0"><div className="flex items-baseline justify-between mb-1"><span className="text-2xs font-black uppercase tracking-wider text-ink-low">Day · {counts.completed} of {counts.all} stops done</span></div><div className="h-1 rounded-full bg-fill-strong overflow-hidden"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${counts.all > 0 ? (counts.completed / counts.all) * 100 : 0}%` }} /></div></div>{pendingSyncCount > 0 && <button type="button" onClick={() => setView("syncCenter")} className="shrink-0 min-h-[36px] px-2.5 rounded-full border border-pending-line bg-pending-dim text-pending text-2xs font-black uppercase tracking-wide haptic" aria-label={`${pendingSyncCount} changes queued — open sync centre`}>{pendingSyncCount} queued</button>}</div>
      {focusJob ? <><FocusCard job={focusJob} live={focusIsLive} stale={focusEntryStale} sinceMs={focusEntry ? new Date(focusEntry.start).getTime() : null} gpsFixed={!!focusEntry?.lat && !!focusEntry?.lng} onOpen={() => openJob(focusJob.id)} onClockIn={() => startClockOn(focusJob.id, currentStaffId)} /><CaptureBar inline job={focusJob} billableActive={focusIsLive} onPhoto={openCamera} onSaveNote={(text) => dispatch({ type: "ADD_VOICE_NOTE", jobId: focusJob.id, note: { id: crypto.randomUUID(), transcript: text, createdAt: new Date().toISOString(), createdBy: currentStaff?.id ?? currentStaffId } })} onPart={() => openJob(focusJob.id)} onSafety={() => openJob(focusJob.id)} onComplete={() => { setActiveId(focusJob.id); setView("signoff"); }} onClockOn={() => startClockOn(focusJob.id, currentStaffId)} /><input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onCameraCapture} className="hidden" aria-label="Camera capture for the current job" /></> : <div className="widget-chassis" style={{ padding: "24px 16px", textAlign: "center" }}><CheckCircle2 size={24} className="text-complete mx-auto mb-2" /><div className="text-title" style={{ fontSize: "1rem" }}>No jobs today</div><div className="label-micro" style={{ marginTop: "6px" }}>New work lands here the moment it&apos;s scheduled</div></div>}
      <section><div className="label-micro jobs-section-label" style={{ marginBottom: "10px" }}>MY RESPONSIBILITIES</div>{duties.length === 0 ? <div className="widget-chassis" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}><span className="icon-socket icon-socket--complete"><CheckCircle2 size={14} /></span><span className="text-sm font-semibold text-ink">All clear — nothing owed right now</span></div> : duties.map((d) => <button key={d.id} type="button" onClick={d.act} className="widget-chassis w-full text-left haptic" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", cursor: "pointer" }} aria-label={d.text}><span className={`icon-socket ${d.tone === "warn" ? "icon-socket--pending" : "icon-socket--accent"}`}><d.icon size={14} /></span><span className="text-sm font-semibold text-ink flex-1">{d.text}</span><span className="text-ink-low text-sm">›</span></button>)}</section>
      <section><div className="label-micro jobs-section-label" style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}><span>TEAM &amp; MANAGEMENT</span>{totalUnread > 0 && <span className="text-2xs font-black rounded-full px-1.5 py-0.5 text-accent bg-accent-dim border border-accent-line">{totalUnread} unread</span>}</div>{comms.length === 0 ? <div className="widget-chassis" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}><span className="icon-socket"><MessageSquare size={14} /></span><span className="text-sm text-ink-low">No new messages — you&apos;re up to date</span></div> : comms.map((m) => <button key={m.id} type="button" onClick={() => openChannel(m.channelId)} className="widget-chassis w-full text-left haptic" style={{ padding: "13px 16px", display: "flex", gap: "12px", marginBottom: "8px", cursor: "pointer", alignItems: "flex-start" }} aria-label={`Message from ${m.author} in ${m.channel?.name ?? "team"}`}><Avatar name={m.authorName} color={m.authorColor} size={36} title={`${m.authorName} in ${m.channel?.name ?? "team"}`} /><span className="flex-1 min-w-0"><span className="flex items-baseline gap-2"><span className="text-sm font-bold text-ink">{m.author}</span><span className="text-2xs text-ink-low font-mono">{m.channel?.name ?? ""}</span><span className="text-2xs text-ink-low ml-auto shrink-0">{new Date(m.ts).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span></span><span className="block text-xs text-ink-mid mt-0.5 line-clamp-2">{m.text}</span></span></button>)}</section>
      <FieldChatSurface />
      {scheduled.length > 0 && <section><div className="label-micro jobs-section-label" style={{ marginBottom: "10px" }}>UP NEXT · {scheduled.length}</div>{scheduled.slice(0, 3).map((job) => <CompactJobRow key={job.id} job={job} onOpen={openJob} onClockIn={(id) => startClockOn(id, currentStaffId)} />)}</section>}
      <div className="rounded-xl border border-line bg-fill px-4 py-3"><button type="button" onClick={() => setSearchOpen((open) => !open)} className="w-full text-left flex items-center gap-2"><span className="text-ink-low text-xs">{searchOpen ? "▼" : "▶"}</span><span className="label-micro">{counts.all} JOBS · {counts.active} ACTIVE · {counts.completed} DONE</span></button>{searchOpen && <div style={{ marginTop: "12px" }}><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH..." aria-label="Search jobs" className="w-full px-3 py-2.5 text-sm font-mono" style={{ background: "var(--app-inset)", border: "1px solid var(--surface-border)", color: "var(--text-primary)", borderRadius: "8px" }} /><div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>{([{ key: "all", label: "ALL", count: counts.all }, { key: "in_progress", label: "ACTIVE", count: counts.active }, { key: "scheduled", label: "NEXT", count: counts.scheduled }, { key: "completed", label: "DONE", count: counts.completed }] as const).map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} className="btn-machined" style={{ flex: 1, height: "40px", fontSize: "0.7rem", background: filter === f.key ? "var(--chrome-600)" : "var(--btn-secondary-bg)", border: filter === f.key ? "1px solid var(--chrome-400)" : "var(--chassis-border)", boxShadow: filter === f.key ? "var(--btn-primary-shadow)" : "var(--btn-secondary-shadow)" }}>{f.label} {f.count}</button>)}</div><div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>{filtered.map((job) => <CompactJobRow key={job.id} job={job} onOpen={openJob} onClockIn={derivedJobStatus(job) === "scheduled" ? (id) => startClockOn(id, currentStaffId) : () => undefined} />)}</div></div>}</div>
    </div>
  );
}

function FocusCard({ job, live, stale, sinceMs, gpsFixed, onOpen, onClockIn }: { job: Job; live: boolean; stale: boolean; sinceMs: number | null; gpsFixed: boolean; onOpen: () => void; onClockIn: () => void }) {
  const status = derivedJobStatus(job); const notes = (job.voiceNotes?.length ?? 0) + (job.logEntries?.length ?? 0); const seconds = useTimer(live && sinceMs !== null, sinceMs); const hh = String(Math.floor(seconds / 3600)).padStart(2, "0"); const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"); const ss = String(seconds % 60).padStart(2, "0");
  return <div className="widget-chassis" style={{ padding: "18px 16px 16px" }}><header className="widget-header" style={{ marginBottom: "12px" }}><span className="job-serial-readout"><span className="work-order-id">{formatSerialWithHash(job.id)}</span>{live && <span className="active-job-led" aria-label="Active job" title="Active job" />}</span>{live ? <span className="flex items-center gap-2">{gpsFixed && !stale && <span className="text-2xs font-black uppercase tracking-wide text-complete" title="Arrival GPS-verified">GPS ✓</span>}<span className={`text-sm font-mono font-bold tabular-nums ${stale ? "text-pending" : "text-ink"}`} title={stale ? "Open since before today — review this time entry" : "On-site elapsed"} aria-label={`On site ${hh} hours ${mm} minutes${stale ? " — entry still open from an earlier day" : ""}`}>{hh}:{mm}:{ss}</span></span> : <StatusChip status={status === "in_progress" ? "in_progress" : "scheduled"} size={12} />}</header><hr className="hairline-divider" style={{ margin: "0 0 12px 0" }} /><div className="text-2xl font-black tracking-tight text-ink leading-tight">{job.client}</div><div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}><span className="icon-socket icon-socket--xs"><MapPin size={12} /></span><span className="text-sm text-ink-mid">{job.address}</span>{job.accessCode && <span className="text-xs text-ink-mid" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><IconKeyAccess size={12} style={{ color: "var(--chrome-400)" }} /> {job.accessCode}</span>}</div><p className="text-sm text-ink-mid mt-1.5 line-clamp-2">{job.scope}</p><div style={{ display: "flex", gap: "8px", marginTop: "14px" }}><button type="button" onClick={onOpen} className="btn-machined primary" style={{ flex: 1, minHeight: "48px" }}>OPEN JOB</button>{job.phone && <a href={`tel:${job.phone}`} className="btn-machined secondary" style={{ minHeight: "48px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 14px", textDecoration: "none" }} aria-label={`Call ${job.client}`}><Phone size={14} /> CALL</a>}<a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" className="btn-machined secondary" style={{ minHeight: "48px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 14px", textDecoration: "none" }} aria-label={`Navigate to ${job.address}`}><Navigation size={14} /> GO</a></div><hr className="hairline-divider" style={{ margin: "14px 0 10px" }} /><div style={{ display: "flex", alignItems: "center", gap: "14px" }}><span className="text-2xs text-ink-low" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span className={`icon-socket icon-socket--xs ${(job.photos?.length ?? 0) > 0 ? "icon-socket--complete" : live ? "icon-socket--pending" : ""}`}><IconCameraField size={12} /></span>{job.photos?.length ?? 0} photos</span><span className="text-2xs text-ink-low" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span className={`icon-socket icon-socket--xs ${(job.serviceItems?.length ?? 0) > 0 ? "icon-socket--complete" : ""}`}><IconHexNut size={12} /></span>{job.serviceItems?.length ?? 0} parts</span><span className="text-2xs text-ink-low" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span className={`icon-socket icon-socket--xs ${notes > 0 ? "icon-socket--complete" : ""}`}><IconNotePen size={12} /></span>{notes} notes</span>{status === "scheduled" && <button type="button" onClick={onClockIn} className="btn-machined primary ml-auto haptic" style={{ minHeight: "36px", padding: "0 12px", fontSize: "0.65rem" }}><Clock size={12} style={{ marginRight: "4px" }} /> CLOCK IN</button>}</div></div>;
}

function CompactJobRow({ job, onOpen, onClockIn }: { job: Job; onOpen: (id: string) => void; onClockIn: (id: string) => void }) {
  const status = derivedJobStatus(job);
  return <SwipeableCard rightAction={status === "scheduled" ? { label: "CLOCK IN", icon: Clock, color: "var(--chrome-600)", onTrigger: () => onClockIn(job.id) } : undefined} leftAction={{ label: "OPEN", icon: Clock, color: "var(--divider-etch)", onTrigger: () => onOpen(job.id) }} onActivate={() => onOpen(job.id)} ariaLabel={`Open job ${formatSerial(job.id)}`}><div className="widget-chassis" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}><span className="work-order-id shrink-0">{formatSerialWithHash(job.id)}</span><span className="flex-1 min-w-0"><span className="block text-sm font-bold text-ink truncate">{job.client}</span><span className="block text-2xs text-ink-low truncate">{job.address}</span></span><span className={`text-2xs font-black uppercase shrink-0 ${status === "in_progress" ? "text-accent" : status === "completed" ? "text-complete" : "text-ink-low"}`}>{status === "in_progress" ? "Live" : status === "completed" ? "Done" : "Sched"}</span></div></SwipeableCard>;
}

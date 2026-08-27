"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Check,
  ChevronRight,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  History,
  Link2,
  MessageCircleQuestion,
  Package,
  Plus,
  Receipt,
  ScrollText,
  ShieldCheck,
  Trash2,
  Umbrella,
  Upload,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { daysUntilExpiry, expiryState, formatBytes, formatDate, relativeTime } from "@/lib/documents";
import type { DocumentCategory, Job, PlumbDocument, Rfi, RfiStatus } from "@/types";
import { formatSerial } from "@/lib/display";

// ── Category catalogue ──────────────────────────────────────────────────────

const DOCUMENT_CATEGORIES: { id: DocumentCategory; label: string; icon: typeof FileText }[] = [
  { id: "spec", label: "Spec / Plan", icon: FileText },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "warranty", label: "Warranty", icon: Award },
  { id: "receipt", label: "Receipt", icon: Receipt },
  { id: "permit", label: "Permit", icon: ScrollText },
  { id: "insurance", label: "Insurance", icon: Umbrella },
  { id: "supplier", label: "Supplier", icon: Package },
  { id: "other", label: "Other", icon: FolderOpen },
];

export function categoryInfo(category: DocumentCategory) {
  return DOCUMENT_CATEGORIES.find((c) => c.id === category) ?? DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];
}

export function CategoryIcon({ category, size = 16 }: { category: DocumentCategory; size?: number }) {
  const info = categoryInfo(category);
  const Icon = info.icon;
  return (
    <span className="w-8 h-8 shrink-0 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
      <Icon size={size} />
    </span>
  );
}

/** Alert badge — renders only for the states that matter (soon / expired). */
export function ExpiryBadge({ expiresOn }: { expiresOn: string | null }) {
  const state = expiryState(expiresOn);
  if (state === "none" || state === "ok") return null;
  const days = expiresOn ? daysUntilExpiry(expiresOn) : 0;
  const label = state === "expired" ? "Expired" : state === "soon" ? `${days}d left` : "";
  const classes =
    state === "expired"
      ? "bg-urgent-dim text-urgent border-urgent-line"
      : "bg-pending-dim text-pending border-pending-line";
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${classes}`}>
      {label}
    </span>
  );
}

export function RfiStatusChip({ status }: { status: RfiStatus }) {
  const classes =
    status === "raised"
      ? "bg-pending-dim text-pending border-pending-line"
      : status === "answered"
        ? "bg-complete-dim text-complete border-complete-line"
        : "bg-fill-strong text-ink-low border-line";
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${classes}`}>
      {status}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Upload sheet ────────────────────────────────────────────────────────────

export function DocumentUploadSheet({
  open,
  onClose,
  presetJobId = null,
}: {
  open: boolean;
  onClose: () => void;
  presetJobId?: string | null;
}) {
  const { jobs, addDocument } = usePlumbTrackCtx();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("spec");
  const [jobId, setJobId] = useState<string | null>(presetJobId);
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setName("");
      setCategory("spec");
      setJobId(presetJobId);
      setExpiresOn("");
      setNotes("");
      setBusy(false);
    }
  }, [open, presetJobId]);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setName(picked.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const url = await readFileAsDataUrl(file);
      const finalName =
        name.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled document";
      addDocument({
        name: finalName.slice(0, 120),
        category,
        tags: category === "compliance" || category === "insurance" ? ["compliance"] : [],
        jobId,
        expiresOn: expiresOn || null,
        notes,
        fileName: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        url,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Add document" subtitle="Store specs, certs, receipts or permits — local-first, free" label="Add document">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[64px] rounded-xl border border-dashed border-line-strong bg-fill flex items-center justify-center gap-2 text-sm font-semibold text-ink-mid haptic"
        >
          {file ? (
            <>
              <FileText size={16} className="text-accent" />
              <span className="truncate max-w-[70%]">{file.name}</span>
              <span className="text-[10px] text-ink-low font-normal">{formatBytes(file.size)}</span>
            </>
          ) : (
            <>
              <Upload size={16} className="text-accent" />
              Choose a file
            </>
          )}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={onPick} aria-label="Choose document file" />

        <label className="block">
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Gas compliance certificate"
            className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-low"
          />
        </label>

        <div>
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1.5">Category</span>
          <div className="flex flex-wrap gap-1.5">
            {DOCUMENT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`min-h-[34px] px-3 rounded-full text-xs font-semibold border transition haptic ${
                  category === c.id
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-fill text-ink-low border-line"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Linked to</span>
          <select
            value={jobId ?? ""}
            onChange={(event) => setJobId(event.target.value || null)}
            className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink bg-transparent"
          >
            <option value="">Company (organisation-wide)</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {formatSerial(j.id)} — {j.client}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">
            Expires on <span className="text-ink-low normal-case">(compliance / insurance only)</span>
          </span>
          <input
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink [color-scheme:dark]"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Reference, version context…"
            className="w-full app-input border rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-low resize-y"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={!file || busy}
          className="w-full min-h-[48px] rounded-xl bg-accent text-on-accent text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 haptic"
        >
          {busy ? <span className="w-4 h-4 border-2 border-edge border-t-edge rounded-full animate-spin" /> : <><Plus size={16} /> Add to vault</>}
        </button>
      </div>
    </BottomSheet>
  );
}

// ── Detail sheet (view / edit / version / delete) ───────────────────────────

export function DocumentDetailSheet({
  open,
  onClose,
  document,
}: {
  open: boolean;
  onClose: () => void;
  document: PlumbDocument | null;
}) {
  const { updateDocument, addDocumentVersion, deleteDocument, openJob, jobs, documents } = usePlumbTrackCtx();
  // Re-read the live record so version additions and edits reflect instantly
  // while the sheet stays open (the prop is a snapshot from open time).
  const live = documents.find((d) => d.id === document?.id) ?? document;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("spec");
  const [expiresOn, setExpiresOn] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const versionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && document) {
      setName(document.name);
      setNotes(document.notes);
      setCategory(document.category);
      setExpiresOn(document.expiresOn ?? "");
      setEditing(false);
      setConfirmDelete(false);
    }
  }, [open, document]);

  if (!live) return null;
  const linkedJob = live.jobId ? jobs.find((j) => j.id === live.jobId) : null;
  const latest = live.versions[live.versions.length - 1];
  const state = expiryState(live.expiresOn);

  const saveEdit = () => {
    updateDocument(live.id, {
      name: name.trim() || live.name,
      notes,
      category,
      expiresOn: expiresOn || null,
    });
    setEditing(false);
  };

  const onVersionFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const url = await readFileAsDataUrl(picked);
    addDocumentVersion(live.id, {
      fileName: picked.name,
      size: picked.size,
      mimeType: picked.type || "application/octet-stream",
      url,
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Document" subtitle={live.category === "compliance" || live.category === "insurance" ? "Compliance record — expiry tracked" : categoryInfo(live.category).label} label="Document details">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <CategoryIcon category={live.category} size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-ink font-bold text-[15px] leading-snug">{live.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] text-ink-low">{live.versions.length} version{live.versions.length === 1 ? "" : "s"} · added {relativeTime(live.createdAt)}</span>
              <ExpiryBadge expiresOn={live.expiresOn} />
            </div>
          </div>
        </div>

        {live.jobId && linkedJob && (
          <button
            type="button"
            onClick={() => {
              onClose();
              openJob(live.jobId!);
            }}
            className="w-full min-h-[44px] rounded-xl border border-line bg-fill flex items-center gap-2 px-3 text-left text-sm text-ink-mid haptic"
          >
            <Link2 size={14} className="text-accent" />
            <span className="flex-1 truncate">{formatSerial(linkedJob.id)} — {linkedJob.client}</span>
            <ChevronRight size={14} className="text-ink-low" />
          </button>
        )}

        {live.expiresOn && (
          <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 border ${
            state === "expired"
              ? "bg-urgent-dim text-urgent border-urgent-line"
              : state === "soon"
                ? "bg-pending-dim text-pending border-pending-line"
                : "bg-complete-dim text-complete border-complete-line"
          }`}>
            <CalendarClock size={14} />
            <span>
              {state === "expired"
                ? `Expired ${formatDate(new Date(new Date(live.expiresOn + "T23:59:59")).toISOString())}`
                : `Expires ${formatDate(new Date(live.expiresOn + "T00:00:00").toISOString())} · ${daysUntilExpiry(live.expiresOn)} days`}
            </span>
          </div>
        )}

        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink" />
            </label>
            <div>
              <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1.5">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`min-h-[34px] px-3 rounded-full text-xs font-semibold border transition haptic ${
                      category === c.id ? "bg-accent/15 text-accent border-accent/30" : "bg-fill text-ink-low border-line"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Expires on</span>
              <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink [color-scheme:dark]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full app-input border rounded-lg px-3 py-2 text-sm text-ink resize-y" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 min-h-[44px] rounded-xl border border-line bg-fill text-sm font-semibold text-ink-mid haptic">Cancel</button>
              <button type="button" onClick={saveEdit} className="flex-1 min-h-[44px] rounded-xl bg-accent text-on-accent text-sm font-bold haptic">Save changes</button>
            </div>
          </div>
        ) : (
          <>
            {live.notes && <p className="text-xs text-ink-low leading-relaxed">{live.notes}</p>}

            <div>
              <p className="text-[10px] font-bold text-ink-low uppercase tracking-wider mb-2 flex items-center gap-1.5"><History size={12} /> Version history</p>
              <div className="space-y-1.5">
                {[...live.versions].reverse().map((version, index) => (
                  <div key={version.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 min-h-[44px]">
                    <span className="w-7 h-7 shrink-0 rounded-md bg-fill-strong text-ink-low flex items-center justify-center text-[10px] font-mono font-bold">v{live.versions.length - index}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-ink-mid truncate">{version.fileName}</p>
                      <p className="text-[10px] text-ink-low">{formatBytes(version.size)} · {relativeTime(version.uploadedAt)}</p>
                    </div>
                    {version.url ? (
                      <a href={version.url} download={version.fileName} className="w-8 h-8 shrink-0 rounded-lg bg-fill-strong text-ink-mid flex items-center justify-center haptic" aria-label={`Download ${version.fileName}`}>
                        <Download size={14} />
                      </a>
                    ) : (
                      <span className="text-[10px] text-ink-low font-medium shrink-0">Demo record</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => versionInputRef.current?.click()} className="flex-1 min-h-[44px] rounded-xl border border-line bg-fill text-ink-mid text-xs font-semibold flex items-center justify-center gap-1.5 haptic">
                <FileUp size={14} /> New version
              </button>
              <button type="button" onClick={() => setEditing(true)} className="flex-1 min-h-[44px] rounded-xl border border-line bg-fill text-ink-mid text-xs font-semibold flex items-center justify-center gap-1.5 haptic">
                <FileText size={14} /> Edit
              </button>
            </div>
            <input ref={versionInputRef} type="file" className="hidden" onChange={onVersionFile} aria-label="Upload new document version" />

            {confirmDelete ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 min-h-[44px] rounded-xl border border-line bg-fill text-sm font-semibold text-ink-mid haptic">Keep</button>
                <button
                  type="button"
                  onClick={() => {
                    deleteDocument(live.id);
                    onClose();
                  }}
                  className="flex-1 min-h-[44px] rounded-xl bg-urgent text-on-accent text-sm font-bold haptic"
                >
                  Delete permanently
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="w-full min-h-[44px] rounded-xl bg-urgent-dim text-urgent text-xs font-semibold border border-urgent-line flex items-center justify-center gap-1.5 haptic">
                <Trash2 size={14} /> Delete document
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// ── RFI sheets ──────────────────────────────────────────────────────────────

export function RaiseRfiSheet({ open, onClose, jobId }: { open: boolean; onClose: () => void; jobId: string }) {
  const { raiseRfi, documents } = usePlumbTrackCtx();
  const [question, setQuestion] = useState("");
  const [attachmentId, setAttachmentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuestion("");
      setAttachmentId(null);
    }
  }, [open]);

  const jobDocs = documents.filter((d) => d.jobId === jobId);

  return (
    <BottomSheet open={open} onClose={onClose} title="Raise RFI" subtitle={`Request information from the office on ${formatSerial(jobId)}`} label="Raise request for information">
      <div className="space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Question</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder="What do you need to know before we proceed?"
            className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-low resize-y"
            autoFocus
          />
        </label>

        {jobDocs.length > 0 && (
          <label className="block">
            <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider block mb-1">Attach a document (optional)</span>
            <select
              value={attachmentId ?? ""}
              onChange={(event) => setAttachmentId(event.target.value || null)}
              className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink bg-transparent"
            >
              <option value="">No attachment</option>
              {jobDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.name}</option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={() => {
            if (!question.trim()) return;
            raiseRfi(jobId, question, attachmentId);
            onClose();
          }}
          disabled={!question.trim()}
          className="w-full min-h-[48px] rounded-xl bg-accent text-on-accent text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 haptic"
        >
          <MessageCircleQuestion size={16} /> Raise request
        </button>
      </div>
    </BottomSheet>
  );
}

export function RfiDetailSheet({
  open,
  onClose,
  rfi,
}: {
  open: boolean;
  onClose: () => void;
  rfi: Rfi | null;
}) {
  const { answerRfi, closeRfi, members, documents, jobs, rfis } = usePlumbTrackCtx();
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (open) setAnswer("");
  }, [open]);

  if (!rfi) return null;
  // Live lookup — the prop is a snapshot from open time, so the sheet reflects
  // answers/closes made while it stays open.
  const live = rfis.find((r) => r.id === rfi.id) ?? rfi;
  const raisedByName = members.find((m) => m.id === live.raisedBy)?.name.split(" ")[0] ?? live.raisedBy;
  const answeredByName = live.answeredBy ? members.find((m) => m.id === live.answeredBy)?.name.split(" ")[0] ?? live.answeredBy : null;
  const attachment = live.attachmentId ? documents.find((d) => d.id === live.attachmentId) : null;
  const job = jobs.find((j) => j.id === live.jobId);

  return (
    <BottomSheet open={open} onClose={onClose} title="Request for information" subtitle={job ? `${formatSerial(job.id)} — ${job.client}` : formatSerial(rfi.jobId)} label="RFI details">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <RfiStatusChip status={live.status} />
            <span className="text-[10px] text-ink-low">{raisedByName} · {relativeTime(live.raisedAt)}</span>
          </div>
          <p className="text-ink font-semibold text-[15px] leading-snug">{live.question}</p>
        </div>

        {attachment && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-fill px-3 py-2.5 text-xs text-ink-mid">
            <Link2 size={13} className="text-accent shrink-0" />
            <span className="truncate">Attached: {attachment.name}</span>
          </div>
        )}

        {live.status === "raised" ? (
          <div className="space-y-2">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={3}
              placeholder="Type the answer for the field team…"
              className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-low resize-y"
            />
            <button
              type="button"
              onClick={() => {
                if (!answer.trim()) return;
                answerRfi(live.id, answer);
              }}
              disabled={!answer.trim()}
              className="w-full min-h-[48px] rounded-xl bg-accent text-on-accent text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 haptic"
            >
              <Check size={16} /> Post answer
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-fill p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-ink-low uppercase tracking-wider">Answer</span>
              <span className="text-[10px] text-ink-low">{answeredByName} · {live.answeredAt ? relativeTime(live.answeredAt) : ""}</span>
            </div>
            <p className="text-sm text-ink-mid leading-relaxed">{live.answer}</p>
            {live.status === "answered" && (
              <button
                type="button"
                onClick={() => closeRfi(live.id)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-line bg-fill text-ink-mid text-xs font-semibold haptic"
              >
                Mark resolved & close
              </button>
            )}
            {live.status === "closed" && (
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-complete uppercase tracking-wider pt-1">
                <Check size={12} /> Closed
              </p>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Job-scoped card (Docs + RFIs) ───────────────────────────────────────────

export function JobDocumentsCard({ job }: { job: Job }) {
  const { documents, rfis } = usePlumbTrackCtx();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<PlumbDocument | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [detailRfi, setDetailRfi] = useState<Rfi | null>(null);

  const jobDocs = documents.filter((d) => d.jobId === job.id);
  const jobRfis = rfis.filter((r) => r.jobId === job.id);
  const openRfis = jobRfis.filter((r) => r.status !== "closed").length;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-ink-low uppercase tracking-wider">Docs & RFIs</p>
          <p className="text-[11px] text-ink-low mt-0.5">Specs, certs, permits · questions to the office</p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="shrink-0 min-h-[36px] px-3 rounded-full bg-accent/15 text-accent border border-accent/25 text-xs font-bold flex items-center gap-1.5 haptic"
        >
          <Upload size={13} /> Upload
        </button>
      </div>

      {jobDocs.length === 0 && jobRfis.length === 0 ? (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="w-full min-h-[56px] rounded-xl border border-dashed border-line flex items-center justify-center text-xs text-ink-low haptic"
        >
          <Plus size={14} className="mr-1.5" /> Add the first document
        </button>
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {jobDocs.map((doc) => {
              const latest = doc.versions[doc.versions.length - 1];
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setDetailDoc(doc)}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 text-left min-h-[46px] haptic"
                >
                  <CategoryIcon category={doc.category} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-ink truncate">{doc.name}</span>
                    <span className="block text-[10px] text-ink-low">
                      {categoryInfo(doc.category).label} · v{doc.versions.length} · {formatBytes(latest?.size ?? 0)}
                    </span>
                  </span>
                  <ExpiryBadge expiresOn={doc.expiresOn} />
                  <ChevronRight size={14} className="text-ink-low shrink-0" />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold text-ink-low uppercase tracking-wider">
              RFIs{openRfis > 0 && <span className="text-pending"> · {openRfis} open</span>}
            </p>
            <button
              type="button"
              onClick={() => setRaiseOpen(true)}
              className="shrink-0 min-h-[32px] px-3 rounded-full border border-line bg-fill text-ink-mid text-[11px] font-semibold flex items-center gap-1.5 haptic"
            >
              <MessageCircleQuestion size={12} /> Raise RFI
            </button>
          </div>

          {jobRfis.length === 0 ? (
            <p className="text-[11px] text-ink-low py-1">No RFIs on this job yet.</p>
          ) : (
            <div className="space-y-1.5">
              {jobRfis.map((rfi) => (
                <button
                  key={rfi.id}
                  type="button"
                  onClick={() => setDetailRfi(rfi)}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 text-left min-h-[46px] haptic"
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-fill text-ink-low flex items-center justify-center">
                    <MessageCircleQuestion size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] text-ink-mid truncate">{rfi.question}</span>
                    <span className="block text-[10px] text-ink-low">{relativeTime(rfi.raisedAt)}</span>
                  </span>
                  <RfiStatusChip status={rfi.status} />
                  <ChevronRight size={14} className="text-ink-low shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <DocumentUploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} presetJobId={job.id} />
      <DocumentDetailSheet open={!!detailDoc} onClose={() => setDetailDoc(null)} document={detailDoc} />
      <RaiseRfiSheet open={raiseOpen} onClose={() => setRaiseOpen(false)} jobId={job.id} />
      <RfiDetailSheet open={!!detailRfi} onClose={() => setDetailRfi(null)} rfi={detailRfi} />
    </GlassCard>
  );
}

/** Banner for the vault — warns about lapsed / lapsing compliance docs. */
export function ExpiryAlertBanner({ documents }: { documents: PlumbDocument[] }) {
  const expiring = documents
    .filter((d) => {
      const state = expiryState(d.expiresOn);
      return state === "soon" || state === "expired";
    })
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));

  if (expiring.length === 0) return null;
  const expiredCount = expiring.filter((d) => expiryState(d.expiresOn) === "expired").length;
  const soonCount = expiring.length - expiredCount;

  return (
    <div className="rounded-xl border border-pending-line bg-pending-dim p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={15} className="text-pending shrink-0" />
        <p className="text-xs font-bold text-pending uppercase tracking-wider">
          {expiredCount > 0 ? `${expiredCount} expired` : ""}
          {expiredCount > 0 && soonCount > 0 ? " · " : ""}
          {soonCount > 0 ? `${soonCount} expiring in 30 days` : ""}
        </p>
      </div>
      <div className="space-y-1.5">
        {expiring.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 text-xs text-ink-mid">
            <ExpiryBadge expiresOn={doc.expiresOn} />
            <span className="truncate flex-1">{doc.name}</span>
            {doc.jobId && <span className="text-[10px] font-mono text-ink-low shrink-0">{formatSerial(doc.jobId)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

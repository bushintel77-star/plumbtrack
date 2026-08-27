"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, FolderOpen, Search, ShieldAlert, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import {
  CategoryIcon,
  categoryInfo,
  DocumentDetailSheet,
  DocumentUploadSheet,
  ExpiryBadge,
} from "@/components/documents/DocumentComponents";
import { expiryState, formatBytes, relativeTime } from "@/lib/documents";
import type { DocumentCategory, PlumbDocument } from "@/types";
import { formatSerial } from "@/lib/display";

type ScopeFilter = "all" | "company" | "jobs";

export function DocumentsView({
  focusDocId,
  onFocusConsumed,
}: {
  /** Document id to auto-open (from global search); consumed after opening. */
  focusDocId?: string | null;
  onFocusConsumed?: () => void;
} = {}) {
  const { documents, jobs } = usePlumbTrackCtx();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<PlumbDocument | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [category, setCategory] = useState<DocumentCategory | "all">("all");

  // Global-search deep link: open the matched document's detail sheet, then
  // clear the focus so a later identical id still re-opens.
  useEffect(() => {
    if (!focusDocId) return;
    const doc = documents.find((d) => d.id === focusDocId);
    if (doc) setDetailDoc(doc);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDocId]);

  const stats = useMemo(() => {
    const expired = documents.filter((d) => expiryState(d.expiresOn) === "expired").length;
    const soon = documents.filter((d) => expiryState(d.expiresOn) === "soon").length;
    return { total: documents.length, expired, soon };
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => {
        if (scope === "company" && d.jobId) return false;
        if (scope === "jobs" && !d.jobId) return false;
        if (category !== "all" && d.category !== category) return false;
        if (!q) return true;
        const haystack = `${d.name} ${d.tags.join(" ")} ${d.notes}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        // Lapsed documents first, then expiring-soon, then newest.
        const rank = (d: PlumbDocument) => {
          const state = expiryState(d.expiresOn);
          return state === "expired" ? 0 : state === "soon" ? 1 : 2;
        };
        const byState = rank(a) - rank(b);
        if (byState !== 0) return byState;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [documents, query, scope, category]);

  const categories: { id: DocumentCategory | "all"; label: string }[] = [
    { id: "all", label: "All" },
    ...["spec", "compliance", "warranty", "receipt", "permit", "insurance", "supplier", "other"].map((id) => ({
      id: id as DocumentCategory,
      label: categoryInfo(id as DocumentCategory).label,
    })),
  ];

  const nearestSoonDays = useMemo(() => {
    const days = documents
      .filter((d) => expiryState(d.expiresOn) === "soon")
      .map((d) => Math.ceil((new Date(d.expiresOn ?? 0).getTime() - Date.now()) / 86_400_000));
    return days.length ? Math.min(...days) : null;
  }, [documents]);

  return (
    <div className="p-3 space-y-2">
      {/* Stats row — expiry warning lives on the tile (exception styling),
          not in a separate banner competing with the CTA. */}
      <div className="grid grid-cols-3 gap-2">
        <GlassCard className="text-center p-3">
          <FolderOpen size={16} className="text-accent mx-auto mb-1" />
          <p className="text-lg font-bold text-ink">{stats.total}</p>
          <p className="text-2xs text-ink-low uppercase tracking-wide">Documents</p>
        </GlassCard>
        <GlassCard className={`text-center p-3 ${stats.soon > 0 ? "border-pending-line" : ""}`}>
          <ShieldAlert size={16} className={`mx-auto mb-1 ${stats.soon > 0 ? "text-pending" : "text-ink-low"}`} />
          <p className="text-lg font-bold text-ink">{stats.soon}</p>
          <p className="text-2xs text-ink-low uppercase tracking-wide">
            Expiring{nearestSoonDays !== null ? ` · ${nearestSoonDays}d` : ""}
          </p>
        </GlassCard>
        <GlassCard className={`text-center p-3 ${stats.expired > 0 ? "border-urgent-line" : ""}`}>
          <AlertCircle size={16} className={`mx-auto mb-1 ${stats.expired > 0 ? "text-urgent" : "text-ink-low"}`} />
          <p className="text-lg font-bold text-ink">{stats.expired}</p>
          <p className="text-2xs text-ink-low uppercase tracking-wide">Expired</p>
        </GlassCard>
      </div>

      {/* Upload — primary CTA, reserved glow surface (chrome-200) */}
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="documents-upload-button w-full min-h-[48px] rounded-xl bg-accent glow-chrome text-on-accent text-sm font-bold flex items-center justify-center gap-2 haptic"
      >
        <Upload size={16} /> Upload document
      </button>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-low" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, tag or note…"
          className="documents-search-input w-full min-h-[44px] app-input border rounded-xl pl-10 pr-3 text-sm text-ink placeholder-ink-low"
          aria-label="Search documents"
        />
      </div>

      {/* Scope + category filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", "company", "jobs"] as ScopeFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`shrink-0 min-h-[32px] px-3 rounded-full text-xs font-bold uppercase tracking-wider border transition haptic ${
              scope === s ? "bg-accent-dim text-accent border-accent-line" : "bg-fill text-ink-low border-line"
            }`}
          >
            {s === "all" ? "All" : s === "company" ? "Company" : "Jobs"}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`shrink-0 min-h-[32px] px-3 rounded-full text-xs font-semibold border transition haptic ${
              category === c.id ? "bg-fill-strong text-ink border-line-strong" : "bg-fill text-ink-low border-line"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <GlassCard>
          <p className="text-ink-low text-sm text-center py-6">No documents match — upload one to start the vault.</p>
        </GlassCard>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((doc) => {
            const latest = doc.versions[doc.versions.length - 1];
            const linkedJob = doc.jobId ? jobs.find((j) => j.id === doc.jobId) : null;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => setDetailDoc(doc)}
                className="w-full flex items-center gap-3 rounded-xl border border-line bg-fill p-3 text-left min-h-[60px] haptic"
              >
                <CategoryIcon category={doc.category} size={20} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-ink truncate">{doc.name}</span>
                  <span className="block text-2xs text-ink-low mt-0.5">
                    {categoryInfo(doc.category).label}
                    {doc.jobId ? ` · ${formatSerial(doc.jobId)}` : " · Company"}
                    {linkedJob ? ` · ${linkedJob.client.split(" ")[0]}` : ""}
                    {doc.versions.length > 0 ? ` · v${doc.versions.length} · ${formatBytes(latest?.size ?? 0)}` : ""}
                    {doc.expiresOn ? ` · ${doc.expiresOn}` : ""}
                    {" · "}{relativeTime(doc.createdAt)}
                  </span>
                </span>
                <ExpiryBadge expiresOn={doc.expiresOn} />
                <ChevronRight size={16} className="text-ink-low shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <DocumentUploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <DocumentDetailSheet open={!!detailDoc} onClose={() => setDetailDoc(null)} document={detailDoc} />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, FileText, MessageSquare, Search, Wrench, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { searchAll } from "@/lib/search";
import { formatSerial } from "@/lib/display";

/** Case-insensitive multi-token highlighting of matches in result text. */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const hits = terms
      .map((term) => ({ term, index: lower.indexOf(term, cursor) }))
      .filter((hit) => hit.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (hits.length === 0) {
      parts.push(text.slice(cursor));
      break;
    }
    const { term, index } = hits[0];
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark key={`${index}-${term}`} className="rounded-[2px] bg-accent-dim text-ink px-0.5">
        {text.slice(index, index + term.length)}
      </mark>,
    );
    cursor = index + term.length;
  }
  return <>{parts}</>;
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-1.5 pt-1">
      <p className="text-2xs font-bold text-ink-low uppercase tracking-wider">{label}</p>
      <span className="text-2xs font-mono text-ink-low">{count}</span>
    </div>
  );
}

export function SearchSheet({
  open,
  onClose,
  onOpenDocument,
}: {
  open: boolean;
  onClose: () => void;
  /** Navigate to the vault and open this document's detail sheet. */
  onOpenDocument: (documentId: string) => void;
}) {
  const { jobs, documents, messages, channels, members, rfis, openJob, setActiveChannelId, setActiveTab, setView } = usePlumbTrackCtx();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const results = useMemo(
    () => searchAll({ jobs, documents, messages, channels, members, rfis }, query),
    [jobs, documents, messages, channels, members, rfis, query],
  );

  const suggestions = useMemo(() => {
    if (query.trim()) return [];
    const chips: string[] = [];
    for (const job of jobs.slice(0, 2)) chips.push(formatSerial(job.id));
    for (const doc of documents.slice(0, 2)) chips.push(doc.name.split(" — ")[0]);
    for (const m of messages.slice(0, 2)) chips.push(m.text.split(" ").slice(0, 3).join(" "));
    return chips.filter((c) => c.length > 2).slice(0, 5);
  }, [jobs, documents, messages, query]);

  const goMessage = (channelId: string) => {
    setActiveChannelId(channelId);
    setActiveTab("messages");
    // Tabs render on the list view — leave any open sub-view first.
    setView("list");
    onClose();
  };

  const goJob = (jobId: string) => {
    openJob(jobId);
    onClose();
  };

  const hasResults = results.total > 0;

  return (
    <BottomSheet open={open} onClose={onClose} title="Search" subtitle="One search across job diary, documents and messages" label="Global search">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-low" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “gas compliance”, “riser leak”, “J-1043”…"
            className="w-full min-h-[48px] app-input border rounded-xl pl-10 pr-10 text-sm text-ink placeholder-ink-low"
            aria-label="Search everything"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-fill-strong text-ink-low flex items-center justify-center haptic"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!query.trim() ? (
          <div className="space-y-2.5">
            <p className="text-xs text-ink-low leading-relaxed">
              Full-text search over your <span className="text-ink-mid font-semibold">job diary</span> (scope, voice notes,
              log entries, daily reports, RFIs), the <span className="text-ink-mid font-semibold">document vault</span> and{" "}
              <span className="text-ink-mid font-semibold">Slack messages</span>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuery(chip)}
                  className="min-h-[32px] px-3 rounded-full border border-line bg-fill text-xs text-ink-low haptic"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : !hasResults ? (
          <p className="text-sm text-ink-low text-center py-8">
            No matches for “{query.trim()}” — try a job id, document name or a word from a message.
          </p>
        ) : (
          <div className="space-y-3">
            {results.jobs.length > 0 && (
              <div>
                <GroupHeader label="Jobs & diary" count={results.jobs.length} />
                <div className="space-y-1.5">
                  {results.jobs.map((hit, index) => (
                    <button
                      key={`${hit.jobId}-${index}`}
                      type="button"
                      onClick={() => goJob(hit.jobId)}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 text-left min-h-[46px] haptic"
                    >
                      <span className="w-8 h-8 shrink-0 rounded-lg bg-accent-dim text-accent flex items-center justify-center">
                        <Wrench size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate"><Highlight text={hit.title} query={query} /></span>
                        <span className="block text-2xs text-ink-low truncate"><Highlight text={hit.snippet} query={query} /> <span className="text-ink-low">· {hit.field}</span></span>
                      </span>
                      <ChevronRight size={14} className="text-ink-low shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results.documents.length > 0 && (
              <div>
                <GroupHeader label="Documents" count={results.documents.length} />
                <div className="space-y-1.5">
                  {results.documents.map((hit) => (
                    <button
                      key={hit.documentId}
                      type="button"
                      onClick={() => {
                        setView("list");
                        onOpenDocument(hit.documentId);
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 text-left min-h-[46px] haptic"
                    >
                      <span className="w-8 h-8 shrink-0 rounded-lg bg-pending-dim text-pending flex items-center justify-center">
                        <FileText size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate"><Highlight text={hit.title} query={query} /></span>
                        <span className="block text-2xs text-ink-low truncate">{hit.subtitle} · <Highlight text={hit.snippet} query={query} /></span>
                      </span>
                      <ChevronRight size={14} className="text-ink-low shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results.messages.length > 0 && (
              <div>
                <GroupHeader label="Messages" count={results.messages.length} />
                <div className="space-y-1.5">
                  {results.messages.map((hit) => (
                    <button
                      key={hit.messageId}
                      type="button"
                      onClick={() => goMessage(hit.channelId)}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-fill p-2.5 text-left min-h-[46px] haptic"
                    >
                      <span className="w-8 h-8 shrink-0 rounded-lg bg-complete-dim text-complete flex items-center justify-center">
                        <MessageSquare size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate"><Highlight text={hit.title} query={query} /></span>
                        <span className="block text-2xs text-ink-low truncate"><Highlight text={hit.snippet} query={query} /></span>
                      </span>
                      <ChevronRight size={14} className="text-ink-low shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

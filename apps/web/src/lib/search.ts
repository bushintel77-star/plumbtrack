/**
 * Global full-text search — one entry point over the document vault, job
 * diary (scope, voice notes, log entries, daily reports, RFIs) and Slack
 * messages. Pure functions over AppState so the UI stays trivial.
 */

import type { Job, PlumbDocument, Rfi, SlackChannel, SlackMember, SlackMessage } from "@/types";

/** Category labels mirror the vault's catalogue (kept local to stay dependency-free). */
const CATEGORY_LABELS: Record<string, string> = {
  spec: "Spec / Plan",
  compliance: "Compliance",
  warranty: "Warranty",
  receipt: "Receipt",
  permit: "Permit",
  insurance: "Insurance",
  supplier: "Supplier",
  other: "Other",
};

export interface JobSearchHit {
  jobId: string;
  /** Which field matched — shown as the subtitle, e.g. "Voice note". */
  field: string;
  title: string;
  snippet: string;
}

export interface DocumentSearchHit {
  documentId: string;
  title: string;
  subtitle: string;
  snippet: string;
}

export interface MessageSearchHit {
  messageId: string;
  channelId: string;
  title: string;
  subtitle: string;
  snippet: string;
  /** ISO timestamp — newest messages rank first. */
  ts: string;
}

export interface SearchResults {
  jobs: JobSearchHit[];
  documents: DocumentSearchHit[];
  messages: MessageSearchHit[];
  total: number;
}

export interface SearchIndex {
  jobs: Job[];
  documents: PlumbDocument[];
  messages: SlackMessage[];
  channels: SlackChannel[];
  members: SlackMember[];
  rfis: Rfi[];
}

const MAX_PER_GROUP = 8;

function tokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}

/** True when every query token appears in the haystack (AND semantics). */
export function matchesAll(haystack: string, query: string): boolean {
  const terms = tokens(query);
  if (terms.length === 0) return false;
  const lower = haystack.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

/** Ellipsized window (±45 chars) around the first query-token hit. */
export function makeSnippet(text: string, query: string, radius = 45): string {
  const terms = tokens(query);
  if (terms.length === 0) return text.slice(0, 90);
  const lower = text.toLowerCase();
  const first = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return text.slice(0, 90);
  const start = Math.max(0, first - radius);
  const end = Math.min(text.length, first + radius + 40);
  const trimmed = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${trimmed}${end < text.length ? "…" : ""}`;
}

function memberName(members: SlackMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id;
}

/**
 * Job diary fields that count as searchable content — scope, contacts,
 * voice notes, production log entries, daily reports and RFIs.
 */
function jobDiaryFields(job: Job) {
  const fields: { label: string; text: string }[] = [];
  fields.push({ label: "Job", text: `${job.scope} ${job.client} ${job.address}` });
  for (const note of job.voiceNotes ?? []) fields.push({ label: "Voice note", text: note.transcript });
  for (const entry of job.logEntries ?? []) fields.push({ label: "Log entry", text: entry.description });
  for (const report of job.dailyReports ?? []) {
    fields.push({ label: "Daily report", text: `${report.workCompleted} ${report.materialsUsed} ${(report.materials ?? []).map((m) => m.description).join(" ")}` });
  }
  return fields;
}

export function searchAll(index: SearchIndex, query: string): SearchResults {
  const q = query.trim();
  if (!q) return { jobs: [], documents: [], messages: [], total: 0 };

  const jobs: JobSearchHit[] = [];
  const seenJobs = new Set<string>();
  for (const job of index.jobs) {
    for (const field of jobDiaryFields(job)) {
      if (matchesAll(field.text, q)) {
        if (!seenJobs.has(job.id)) seenJobs.add(job.id);
        jobs.push({
          jobId: job.id,
          field: field.label,
          title: `${job.id} · ${job.client}`,
          snippet: makeSnippet(field.text, q),
        });
      }
    }
    for (const rfi of index.rfis ?? []) {
      if (rfi.jobId !== job.id) continue;
      const text = `${rfi.question} ${rfi.answer}`;
      if (matchesAll(text, q)) {
        if (!seenJobs.has(job.id)) seenJobs.add(job.id);
        jobs.push({
          jobId: job.id,
          field: "RFI",
          title: `${job.id} · ${job.client}`,
          snippet: makeSnippet(text, q),
        });
      }
    }
  }
  jobs.sort((a, b) => Number(b.field === "Job") - Number(a.field === "Job"));

  const documents: DocumentSearchHit[] = [];
  for (const doc of index.documents) {
    const categoryLabel = CATEGORY_LABELS[doc.category] ?? "Other";
    const haystack = `${doc.name} ${doc.tags.join(" ")} ${doc.notes} ${categoryLabel}`;
    if (!matchesAll(haystack, q)) continue;
    const linkedJob = doc.jobId ? index.jobs.find((j) => j.id === doc.jobId) : null;
    documents.push({
      documentId: doc.id,
      title: doc.name,
      subtitle: linkedJob ? `${doc.jobId} · ${categoryLabel}` : `Company · ${categoryLabel}`,
      snippet: makeSnippet(`${doc.notes || doc.name} ${doc.tags.join(" ")}`, q),
    });
  }

  const channelName = (channelId: string) => index.channels.find((c) => c.id === channelId)?.name ?? channelId;
  const messages: MessageSearchHit[] = [];
  for (const message of index.messages) {
    const author = memberName(index.members, message.authorId);
    const haystack = `${message.text} ${channelName(message.channelId)} ${author}`;
    if (!matchesAll(haystack, q)) continue;
    messages.push({
      messageId: message.id,
      channelId: message.channelId,
      title: `#${channelName(message.channelId)} · ${author}`,
      subtitle: message.parentId ? "Thread reply" : "Message",
      snippet: makeSnippet(message.text, q),
      ts: message.ts,
    });
  }
  messages.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    jobs: jobs.slice(0, MAX_PER_GROUP),
    documents: documents.slice(0, MAX_PER_GROUP),
    messages: messages.slice(0, MAX_PER_GROUP),
    total: jobs.length + documents.length + messages.length,
  };
}

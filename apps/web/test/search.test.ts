import { describe, expect, it } from "vitest";
import { makeSnippet, matchesAll, searchAll, type SearchIndex } from "../src/lib/search";
import type { Job, PlumbDocument, SlackChannel, SlackMember, SlackMessage } from "../src/types";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "J-1",
    client: "Marlene Cho",
    address: "9 Booran Rd, Caulfield South VIC",
    scope: "Kitchen mixer tap leaking, possible cartridge replacement",
    status: "scheduled",
    signature: null,
    timeEntries: [],
    photos: [],
    logEntries: [],
    dailyReports: [],
    checklists: [],
    milestones: [],
    ...overrides,
  };
}

function doc(overrides: Partial<PlumbDocument> = {}): PlumbDocument {
  return {
    id: "doc-1",
    name: "Gas compliance certificate — unit 6",
    category: "compliance",
    tags: ["gas", "compliance"],
    jobId: "J-1",
    expiresOn: null,
    notes: "Post-repair gas test",
    versions: [],
    createdAt: "2026-01-05T08:00:00.000Z",
    createdBy: "tim",
    ...overrides,
  };
}

const channels: SlackChannel[] = [{ id: "field-updates", type: "channel", name: "field-updates", lastReadAt: null }];
const members: SlackMember[] = [{ id: "tim", name: "Tim Bennett", role: "owner", color: "#E8871E", presence: "active" }];
const messages: SlackMessage[] = [
  { id: "m-1", channelId: "field-updates", authorId: "tim", text: "On site at the riser now. Access to unit 6 confirmed.", ts: "2026-01-05T09:00:00.000Z", reactions: {} },
  { id: "m-2", channelId: "field-updates", authorId: "plumbtrack", text: "📍 Clocked on at J-1043", ts: "2026-01-05T08:00:00.000Z", reactions: {} },
];

function index(overrides: Partial<SearchIndex> = {}): SearchIndex {
  return { jobs: [job()], documents: [doc()], messages, channels, members, rfis: [], ...overrides };
}

describe("matchesAll", () => {
  it("matches case-insensitively across all tokens (AND)", () => {
    expect(matchesAll("Gas compliance certificate", "gas compliance")).toBe(true);
    expect(matchesAll("Gas compliance certificate", "GAS")).toBe(true);
    expect(matchesAll("Gas compliance certificate", "gas warranty")).toBe(false);
  });

  it("rejects empty queries", () => {
    expect(matchesAll("anything", "   ")).toBe(false);
  });
});

describe("makeSnippet", () => {
  it("windows around the first hit with ellipses", () => {
    const text =
      "Morning update for the crew: we are on site at the riser now. Access to unit 6 riser cabinet has been " +
      "confirmed before we start the isolation work on the stack, and the insurer has the claim reference on file.";
    const snippet = makeSnippet(text, "riser");
    expect(snippet).toContain("riser");
    expect(snippet.length).toBeLessThan(text.length);

    // A hit deep in the text gets a leading ellipsis.
    const deep = makeSnippet("a ".repeat(60) + "warranty certificate", "warranty");
    expect(deep.startsWith("…")).toBe(true);
    expect(deep).toContain("warranty");
  });

  it("returns the head of the text when there is no hit", () => {
    expect(makeSnippet("hello world", "zzz")).toBe("hello world");
  });
});

describe("searchAll", () => {
  it("returns empty results for an empty query", () => {
    const results = searchAll(index(), "");
    expect(results.total).toBe(0);
  });

  it("finds documents by name, tags and notes", () => {
    const byName = searchAll(index(), "gas certificate");
    expect(byName.documents.map((d) => d.documentId)).toEqual(["doc-1"]);

    const byNote = searchAll(index(), "post-repair");
    expect(byNote.documents).toHaveLength(1);
  });

  it("finds jobs through the diary (scope and voice notes)", () => {
    const byScope = searchAll(index(), "kitchen mixer tap");
    expect(byScope.jobs[0]).toMatchObject({ jobId: "J-1", field: "Job" });

    const withNote = index({
      jobs: [job({ voiceNotes: [{ id: "v1", transcript: "Riser leak located in unit 6 stack — isolating feed now", createdAt: "2026-01-05T08:00:00.000Z", createdBy: "tim" }] })],
    });
    const byNote = searchAll(withNote, "isolating feed");
    expect(byNote.jobs[0].field).toBe("Voice note");
    expect(byNote.jobs[0].snippet).toContain("isolating feed");
  });

  it("finds jobs through an RFI question", () => {
    const withRfi = index({
      rfis: [{ id: "rfi-1", jobId: "J-1", question: "Does the insurer cover the riser cabinet access fee?", attachmentId: null, status: "raised", raisedBy: "sarah", raisedAt: "2026-01-05T08:00:00.000Z", answer: "", answeredBy: null, answeredAt: null }],
    });
    const results = searchAll(withRfi, "insurer cover");
    expect(results.jobs.some((hit) => hit.field === "RFI")).toBe(true);
  });

  it("finds messages by body and channel", () => {
    const byBody = searchAll(index(), "access to unit 6");
    expect(byBody.messages.map((m) => m.messageId)).toEqual(["m-1"]);
    expect(byBody.messages[0].title).toContain("#field-updates");

    const byChannel = searchAll(index(), "field-updates");
    expect(byChannel.messages).toHaveLength(2);
  });

  it("sorts messages newest first", () => {
    const results = searchAll(index(), "riser");
    expect(results.messages.map((m) => m.messageId)).toEqual(["m-1"]);
  });
});

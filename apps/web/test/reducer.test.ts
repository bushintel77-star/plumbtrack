import { describe, expect, it } from "vitest";
import type { AppState, Job, TimeEntry } from "../src/types";
import { reducer } from "../src/state/reducer";

function baseState(jobs: Job[]): AppState {
  return {
    jobs,
    quotes: [],
    channels: [],
    members: [],
    messages: [],
    shifts: [],
    syncQueue: [],
    serverEntryIds: {},
    documents: [],
    rfis: [],
  };
}

function jobWith(entries: TimeEntry[]): Job {
  return {
    id: "J-1",
    client: "Client",
    address: "1 Test St",
    scope: "Fix the thing",
    status: "in_progress",
    signature: null,
    timeEntries: entries,
    photos: [],
    logEntries: [],
    dailyReports: [],
    checklists: [],
    milestones: [],
  };
}

describe("CLOCK_ON", () => {
  it("records the staff member on the new open entry", () => {
    const state = baseState([jobWith([])]);
    const next = reducer(state, { type: "CLOCK_ON", jobId: "J-1", staffId: "sarah", lat: null, lng: null });
    const entries = next.jobs[0].timeEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ staffId: "sarah", end: null });
  });

  it("allows a second staff member to clock in while another is already running", () => {
    const timOpen: TimeEntry = { id: "t1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: null, lat: null, lng: null };
    const state = baseState([jobWith([timOpen])]);
    const next = reducer(state, { type: "CLOCK_ON", jobId: "J-1", staffId: "sarah", lat: null, lng: null });
    const open = next.jobs[0].timeEntries.filter((e) => e.end === null);
    expect(open).toHaveLength(2);
    expect(open.map((e) => e.staffId).sort()).toEqual(["sarah", "tim"]);
  });
});

describe("CLOCK_OFF", () => {
  it("closes the running entry for the given staff member", () => {
    const timOpen: TimeEntry = { id: "t1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: null, lat: null, lng: null };
    const state = baseState([jobWith([timOpen])]);
    const next = reducer(state, { type: "CLOCK_OFF", jobId: "J-1", staffId: "tim" });
    const entries = next.jobs[0].timeEntries;
    expect(entries[0].end).not.toBeNull();
  });

  it("closes only the caller's entry, leaving other staff members running", () => {
    const timOpen: TimeEntry = { id: "t1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: null, lat: null, lng: null };
    const sarahOpen: TimeEntry = { id: "s1", staffId: "sarah", start: "2024-01-01T08:05:00.000Z", end: null, lat: null, lng: null };
    const state = baseState([jobWith([timOpen, sarahOpen])]);

    // Sarah clocks off — Tim stays running.
    const afterSarah = reducer(state, { type: "CLOCK_OFF", jobId: "J-1", staffId: "sarah" });
    const open = afterSarah.jobs[0].timeEntries.filter((e) => e.end === null);
    expect(open).toHaveLength(1);
    expect(open[0].staffId).toBe("tim");

    // Tim's entry is still open and untouched.
    const timEntry = afterSarah.jobs[0].timeEntries.find((e) => e.id === "t1");
    expect(timEntry?.end).toBeNull();
  });

  it("does not touch closed entries or other jobs", () => {
    const closed: TimeEntry = { id: "c1", staffId: "tim", start: "2024-01-01T07:00:00.000Z", end: "2024-01-01T07:30:00.000Z", lat: null, lng: null };
    const open: TimeEntry = { id: "o1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: null, lat: null, lng: null };
    const otherJob = { ...jobWith([open]), id: "J-2" };
    const state = baseState([jobWith([closed]), otherJob]);

    const next = reducer(state, { type: "CLOCK_OFF", jobId: "J-1", staffId: "tim" });
    expect(next.jobs[0].timeEntries.find((e) => e.id === "c1")?.end).toBe("2024-01-01T07:30:00.000Z");
    expect(next.jobs[1].timeEntries[0].end).toBeNull();
  });
});

describe("sync queue", () => {
  it("CLOCK_ON enqueues a clock-in op referencing the new local entry", () => {
    const state = baseState([jobWith([])]);
    const next = reducer(state, { type: "CLOCK_ON", jobId: "J-1", staffId: "sarah", lat: null, lng: null });
    expect(next.syncQueue).toHaveLength(1);
    const op = next.syncQueue[0];
    expect(op.kind).toBe("clock-in");
    if (op.kind === "clock-in") {
      expect(op.jobId).toBe("J-1");
      expect(op.payload).toMatchObject({ staffId: "sarah" });
      expect(op.localEntryId).toBe(next.jobs[0].timeEntries[0].id);
    }
  });

  it("CLOCK_OFF enqueues a clock-out op for the closed entry", () => {
    const open: TimeEntry = { id: "t1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: null, lat: null, lng: null };
    const state = baseState([jobWith([open])]);
    const next = reducer(state, { type: "CLOCK_OFF", jobId: "J-1", staffId: "tim" });
    expect(next.syncQueue).toHaveLength(1);
    const op = next.syncQueue[0];
    expect(op.kind).toBe("clock-out");
    if (op.kind === "clock-out") {
      expect(op.localEntryId).toBe("t1");
      expect(op.payload.end).toBeDefined();
    }
    expect(next.jobs[0].timeEntries[0].end).not.toBeNull();
  });

  it("CLOCK_OFF does not enqueue when there is nothing to close", () => {
    const closed: TimeEntry = { id: "c1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: "2024-01-01T09:00:00.000Z", lat: null, lng: null };
    const state = baseState([jobWith([closed])]);
    const next = reducer(state, { type: "CLOCK_OFF", jobId: "J-1", staffId: "tim" });
    expect(next.syncQueue).toHaveLength(0);
  });

  it("REMOVE_SYNC_OP drops the acknowledged op", () => {
    const state = baseState([]);
    const withOp = reducer(state, { type: "CLOCK_ON", jobId: "J-1", staffId: "tim", lat: null, lng: null });
    const op = withOp.syncQueue[0];
    const next = reducer(withOp, { type: "REMOVE_SYNC_OP", opId: op.opId });
    expect(next.syncQueue).toHaveLength(0);
  });

  it("RECORD_ENTRY_SERVER_ID maps the local entry to its server id", () => {
    const state = baseState([]);
    const next = reducer(state, { type: "RECORD_ENTRY_SERVER_ID", localEntryId: "local-1", serverId: "cuid-123" });
    expect(next.serverEntryIds).toEqual({ "local-1": "cuid-123" });
  });

  it("QUEUE_NOTIFICATION persists a Slack handoff with its idempotency key", () => {
    const state = baseState([]);
    const next = reducer(state, {
      type: "QUEUE_NOTIFICATION",
      opId: "notification-op-1",
      channel: "field-updates",
      author: "plumbtrack",
      text: "Job completed",
    });
    expect(next.syncQueue).toEqual([
      {
        kind: "notification",
        opId: "notification-op-1",
        payload: { channel: "field-updates", author: "plumbtrack", text: "Job completed" },
      },
    ]);
  });
});

describe("MERGE_REMOTE", () => {
  it("backfills staffId on legacy remote entries", () => {
    const remoteJob = {
      ...jobWith([]),
      timeEntries: [
        { id: "r1", start: "2024-01-01T08:00:00.000Z", end: "2024-01-01T09:00:00.000Z", lat: null, lng: null },
      ] as unknown as TimeEntry[],
    };
    const state = baseState([]);
    const next = reducer(state, { type: "MERGE_REMOTE", jobs: [remoteJob], quotes: [] });
    expect(next.jobs[0].timeEntries[0].staffId).toBe("tim");
  });

  it("preserves locally-pending entries while dropping synced twins", () => {
    const remoteEntry: TimeEntry = { id: "server-1", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: "2024-01-01T09:00:00.000Z", lat: null, lng: null };
    const remoteJob = { ...jobWith([]), timeEntries: [remoteEntry] };
    const localSynced: TimeEntry = { id: "local-synced", staffId: "tim", start: "2024-01-01T08:00:00.000Z", end: "2024-01-01T09:00:00.000Z", lat: null, lng: null };
    const localPending: TimeEntry = { id: "local-pending", staffId: "tim", start: "2024-01-01T10:00:00.000Z", end: null, lat: null, lng: null };
    const state = baseState([jobWith([localSynced, localPending])]);
    state.serverEntryIds = { "local-synced": "server-1" };

    const next = reducer(state, { type: "MERGE_REMOTE", jobs: [remoteJob], quotes: [] });
    const merged = next.jobs[0].timeEntries;
    expect(merged.map((e) => e.id).sort()).toEqual(["local-pending", "server-1"]);
  });
});

// ── Shifts (log-on / log-off) ────────────────────────────────────────────────

describe("LOG_ON", () => {
  it("opens a shift for the staff member with the acknowledged tracking notice", () => {
    const state = baseState([]);
    const next = reducer(state, {
      type: "LOG_ON",
      staffId: "tim",
      workType: "callback",
      startedAt: "2026-01-05T07:00:00.000Z",
      noticeAckAt: "2026-01-05T07:00:00.000Z",
    });
    expect(next.shifts).toHaveLength(1);
    expect(next.shifts[0]).toMatchObject({
      staffId: "tim",
      workType: "callback",
      loggedOnAt: "2026-01-05T07:00:00.000Z",
      loggedOffAt: null,
      trackingNoticeAckAt: "2026-01-05T07:00:00.000Z",
    });
  });

  it("ignores a second log-on while a shift is already open", () => {
    const state = baseState([]);
    const on = reducer(state, {
      type: "LOG_ON", staffId: "tim", workType: "standard",
      startedAt: "2026-01-05T07:00:00.000Z", noticeAckAt: "2026-01-05T07:00:00.000Z",
    });
    const again = reducer(on, {
      type: "LOG_ON", staffId: "tim", workType: "callback",
      startedAt: "2026-01-05T08:00:00.000Z", noticeAckAt: "2026-01-05T08:00:00.000Z",
    });
    expect(again.shifts).toHaveLength(1);
    expect(again.shifts[0].workType).toBe("standard");
  });
});

describe("START_BREAK / END_BREAK", () => {
  function onShift() {
    return reducer(baseState([]), {
      type: "LOG_ON", staffId: "tim", workType: "standard",
      startedAt: "2026-01-05T07:00:00.000Z", noticeAckAt: "2026-01-05T07:00:00.000Z",
    });
  }

  it("opens and closes an unpaid break on the running shift", () => {
    const withBreak = reducer(onShift(), { type: "START_BREAK", staffId: "tim" });
    expect(withBreak.shifts[0].breaks).toHaveLength(1);
    expect(withBreak.shifts[0].breaks[0].end).toBeNull();

    const closed = reducer(withBreak, { type: "END_BREAK", staffId: "tim" });
    expect(closed.shifts[0].breaks[0].end).not.toBeNull();
  });

  it("does not stack a second break while one is running", () => {
    const withBreak = reducer(onShift(), { type: "START_BREAK", staffId: "tim" });
    const stillOne = reducer(withBreak, { type: "START_BREAK", staffId: "tim" });
    expect(stillOne.shifts[0].breaks).toHaveLength(1);
  });
});

describe("LOG_OFF", () => {
  function onShiftWithOpenEntries() {
    const openA: TimeEntry = { id: "a1", staffId: "tim", start: "2026-01-05T08:00:00.000Z", end: null, lat: null, lng: null };
    const openB: TimeEntry = { id: "b1", staffId: "tim", start: "2026-01-05T09:00:00.000Z", end: null, lat: null, lng: null };
    const sarahOpen: TimeEntry = { id: "s1", staffId: "sarah", start: "2026-01-05T09:05:00.000Z", end: null, lat: null, lng: null };
    const jobA = { ...jobWith([openA]), id: "J-1" };
    const jobB = { ...jobWith([openB, sarahOpen]), id: "J-2" };
    let state = baseState([jobA, jobB]);
    state = reducer(state, {
      type: "LOG_ON", staffId: "tim", workType: "standard",
      startedAt: "2026-01-05T07:00:00.000Z", noticeAckAt: "2026-01-05T07:00:00.000Z",
    });
    return state;
  }

  it("seals the shift and closes every open time entry for the staff member across all jobs", () => {
    const next = reducer(onShiftWithOpenEntries(), {
      type: "LOG_OFF", staffId: "tim", endedAt: "2026-01-05T16:00:00.000Z",
      kmDriven: 42, toilElection: true, workType: "inclement",
    });
    expect(next.shifts[0].loggedOffAt).toBe("2026-01-05T16:00:00.000Z");
    expect(next.shifts[0].kmDriven).toBe(42);
    expect(next.shifts[0].toilElection).toBe(true);
    expect(next.shifts[0].workType).toBe("inclement");
    // Tim's entries on both jobs are closed…
    expect(next.jobs[0].timeEntries.find((e) => e.id === "a1")!.end).toBe("2026-01-05T16:00:00.000Z");
    expect(next.jobs[1].timeEntries.find((e) => e.id === "b1")!.end).toBe("2026-01-05T16:00:00.000Z");
    // …while Sarah's stays running.
    expect(next.jobs[1].timeEntries.find((e) => e.id === "s1")!.end).toBeNull();
  });

  it("queues a clock-out sync op per closed entry", () => {
    const next = reducer(onShiftWithOpenEntries(), {
      type: "LOG_OFF", staffId: "tim", endedAt: "2026-01-05T16:00:00.000Z",
    });
    const ops = next.syncQueue.filter((op) => op.kind === "clock-out");
    expect(ops).toHaveLength(2);
    expect(ops.every((op) => op.kind === "clock-out" && op.payload.end === "2026-01-05T16:00:00.000Z")).toBe(true);
  });

  it("closes an open meal break at the log-off timestamp", () => {
    let state = onShiftWithOpenEntries();
    state = reducer(state, { type: "START_BREAK", staffId: "tim" });
    const next = reducer(state, { type: "LOG_OFF", staffId: "tim", endedAt: "2026-01-05T16:00:00.000Z" });
    expect(next.shifts[0].breaks[0].end).toBe("2026-01-05T16:00:00.000Z");
  });

  it("is a no-op when no shift is open", () => {
    const state = baseState([]);
    const next = reducer(state, { type: "LOG_OFF", staffId: "tim", endedAt: "2026-01-05T16:00:00.000Z" });
    expect(next).toBe(state);
  });
});

// ── Documents (vault) ────────────────────────────────────────────────────────

describe("documents", () => {
  function doc(id: string) {
    return {
      id,
      name: `Document ${id}`,
      category: "compliance" as const,
      tags: [],
      jobId: null,
      expiresOn: null,
      notes: "",
      versions: [],
      createdAt: "2026-01-05T08:00:00.000Z",
      createdBy: "tim",
    };
  }

  it("ADD_DOCUMENT prepends the document to the vault", () => {
    const next = reducer(baseState([]), { type: "ADD_DOCUMENT", document: doc("d1") });
    expect(next.documents.map((d) => d.id)).toEqual(["d1"]);
  });

  it("UPDATE_DOCUMENT patches metadata without touching versions", () => {
    const state = { ...baseState([]), documents: [doc("d1")] };
    const next = reducer(state, { type: "UPDATE_DOCUMENT", documentId: "d1", patch: { expiresOn: "2026-12-31" } });
    expect(next.documents[0].expiresOn).toBe("2026-12-31");
    expect(next.documents[0].name).toBe("Document d1");
  });

  it("ADD_DOCUMENT_VERSION appends a new revision", () => {
    const state = { ...baseState([]), documents: [doc("d1")] };
    const next = reducer(state, {
      type: "ADD_DOCUMENT_VERSION",
      documentId: "d1",
      version: {
        id: "v2",
        fileName: "cert-v2.pdf",
        size: 100,
        mimeType: "application/pdf",
        url: "data:application/pdf;base64,abc",
        uploadedAt: "2026-01-06T08:00:00.000Z",
        uploadedBy: "sarah",
      },
    });
    expect(next.documents[0].versions).toHaveLength(1);
    expect(next.documents[0].versions[0].id).toBe("v2");
  });

  it("DELETE_DOCUMENT removes the document and unlinks RFI attachments", () => {
    const state = {
      ...baseState([]),
      documents: [doc("d1")],
      rfis: [{ id: "r1", jobId: "J-1", question: "?", attachmentId: "d1", status: "raised" as const, raisedBy: "tim", raisedAt: "2026-01-05T08:00:00.000Z", answer: "", answeredBy: null, answeredAt: null }],
    };
    const next = reducer(state, { type: "DELETE_DOCUMENT", documentId: "d1" });
    expect(next.documents).toHaveLength(0);
    expect(next.rfis[0].attachmentId).toBeNull();
  });
});

// ── RFIs ─────────────────────────────────────────────────────────────────────

describe("rfis", () => {
  function raised() {
    return {
      id: "r1",
      jobId: "J-1",
      question: "Is the meter accessible?",
      attachmentId: null,
      status: "raised" as const,
      raisedBy: "sarah",
      raisedAt: "2026-01-05T08:00:00.000Z",
      answer: "",
      answeredBy: null,
      answeredAt: null,
    };
  }

  it("RAISE_RFI prepends the request", () => {
    const next = reducer(baseState([]), { type: "RAISE_RFI", rfi: raised() });
    expect(next.rfis.map((r) => r.id)).toEqual(["r1"]);
  });

  it("ANSWER_RFI moves a raised RFI to answered with the response", () => {
    const state = { ...baseState([]), rfis: [raised()] };
    const next = reducer(state, { type: "ANSWER_RFI", rfiId: "r1", answer: "Yes — behind the laundry door.", answeredBy: "tim" });
    expect(next.rfis[0].status).toBe("answered");
    expect(next.rfis[0].answer).toBe("Yes — behind the laundry door.");
    expect(next.rfis[0].answeredBy).toBe("tim");
    expect(next.rfis[0].answeredAt).not.toBeNull();
  });

  it("ANSWER_RFI is ignored once already answered", () => {
    const state = { ...baseState([]), rfis: [{ ...raised(), status: "answered" as const }] };
    const next = reducer(state, { type: "ANSWER_RFI", rfiId: "r1", answer: "Second answer", answeredBy: "mike" });
    expect(next.rfis[0].answer).toBe("");
  });

  it("CLOSE_RFI seals a resolved request", () => {
    const state = { ...baseState([]), rfis: [{ ...raised(), status: "answered" as const }] };
    const next = reducer(state, { type: "CLOSE_RFI", rfiId: "r1" });
    expect(next.rfis[0].status).toBe("closed");
  });
});

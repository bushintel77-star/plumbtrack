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
    syncQueue: [],
    serverEntryIds: {},
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

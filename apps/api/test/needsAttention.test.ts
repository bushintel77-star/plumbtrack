import { describe, expect, it } from "vitest";
import { computeNeedsAttention, type AttentionInputJob } from "../src/lib/needsAttention";

const NOW = new Date("2026-09-06T10:00:00.000Z");

function job(overrides: Partial<AttentionInputJob> = {}): AttentionInputJob {
  return {
    id: "J-1",
    client: "Northgate Mall",
    address: "1 High St",
    scope: "Leak repair",
    status: "scheduled",
    lat: null,
    lng: null,
    appointment: {
      assignedStaffId: "u-tech",
      assignedStaffName: "Tech One",
      scheduledStart: "2026-09-06T08:00:00.000Z",
      scheduledEnd: "2026-09-06T09:00:00.000Z",
    },
    timeEntries: [],
    ...overrides,
  };
}

describe("computeNeedsAttention", () => {
  it("flags an open job past its scheduled end as overdue (red)", () => {
    const flags = computeNeedsAttention([job()], NOW);
    const overdue = flags.find(f => f.reason === "overdue");
    expect(overdue).toBeDefined();
    expect(overdue?.severity).toBe("red");
    expect(overdue?.jobIds).toEqual(["J-1"]);
  });

  it("does not flag a completed job as overdue", () => {
    const flags = computeNeedsAttention(
      [job({ status: "completed", timeEntries: [{ start: "2026-09-06T08:00:00.000Z", end: "2026-09-06T09:30:00.000Z" }] })],
      NOW
    );
    expect(flags.find(f => f.reason === "overdue")).toBeUndefined();
  });

  it("flags a job with no technician as unassigned (blue)", () => {
    const flags = computeNeedsAttention(
      [job({ appointment: { assignedStaffId: null, assignedStaffName: null, scheduledStart: "2026-09-06T13:00:00.000Z", scheduledEnd: "2026-09-06T14:00:00.000Z" } })],
      NOW
    );
    const unassigned = flags.find(f => f.reason === "unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned?.severity).toBe("blue");
  });

  it("flags consecutive same-tech jobs at different addresses with an insufficient gap (amber)", () => {
    const first = job({
      id: "J-A",
      address: "1 High St",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T13:00:00.000Z",
        scheduledEnd: "2026-09-06T14:00:00.000Z",
      },
    });
    const second = job({
      id: "J-B",
      address: "200 Beach Rd",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T14:10:00.000Z",
        scheduledEnd: "2026-09-06T15:00:00.000Z",
      },
    });
    const flags = computeNeedsAttention([first, second], NOW);
    const travel = flags.find(f => f.reason === "travel_buffer");
    expect(travel).toBeDefined();
    expect(travel?.severity).toBe("amber");
    expect(travel?.jobIds).toEqual(["J-A", "J-B"]);
  });

  it("does not flag consecutive jobs at the same address", () => {
    const first = job({
      id: "J-A",
      address: "1 High St",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T13:00:00.000Z",
        scheduledEnd: "2026-09-06T14:00:00.000Z",
      },
    });
    const second = job({
      id: "J-B",
      address: "1 High St",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T14:05:00.000Z",
        scheduledEnd: "2026-09-06T15:00:00.000Z",
      },
    });
    expect(computeNeedsAttention([first, second], NOW).find(f => f.reason === "travel_buffer")).toBeUndefined();
  });

  it("does not flag a comfortable gap between different addresses", () => {
    const first = job({
      id: "J-A",
      address: "1 High St",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T13:00:00.000Z",
        scheduledEnd: "2026-09-06T14:00:00.000Z",
      },
    });
    const second = job({
      id: "J-B",
      address: "200 Beach Rd",
      appointment: {
        assignedStaffId: "u-tech",
        assignedStaffName: "Tech One",
        scheduledStart: "2026-09-06T15:00:00.000Z",
        scheduledEnd: "2026-09-06T16:00:00.000Z",
      },
    });
    expect(computeNeedsAttention([first, second], NOW).find(f => f.reason === "travel_buffer")).toBeUndefined();
  });

  it("sorts flags red, then amber, then blue", () => {
    const flags = computeNeedsAttention(
      [
        job({ id: "J-over", appointment: { assignedStaffId: "u-t", assignedStaffName: "T", scheduledStart: "2026-09-06T08:00:00.000Z", scheduledEnd: "2026-09-06T09:00:00.000Z" } }),
        job({ id: "J-unas", appointment: { assignedStaffId: null, assignedStaffName: null, scheduledStart: "2026-09-06T13:00:00.000Z", scheduledEnd: "2026-09-06T14:00:00.000Z" } }),
      ],
      NOW
    );
    const reasons = flags.map(f => f.reason);
    expect(reasons.indexOf("overdue")).toBeLessThan(reasons.indexOf("unassigned"));
  });
});

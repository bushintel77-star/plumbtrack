import { describe, expect, it } from "vitest";
import { formatSerial, formatSerialWithHash } from "../src/lib/display";

describe("formatSerial", () => {
  it("formats generated ids as uppercase stamped serials", () => {
    expect(formatSerial("cmt97b9lk002cwqa4jm4mlwln")).toBe("CMT-97B9");
  });

  it("keeps short domain ids readable", () => {
    expect(formatSerial("J-1043")).toBe("J-1043");
    expect(formatSerial("Q-2091")).toBe("Q-2091");
  });

  it("supports hash-prefixed display labels", () => {
    expect(formatSerialWithHash("cmt97b9lk002cwqa4jm4mlwln")).toBe("#CMT-97B9");
  });
});

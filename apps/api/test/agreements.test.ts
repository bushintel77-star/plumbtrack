import { describe, expect, it } from "vitest";
import { agreementSnapshot, scopeNamesService } from "../src/lib/agreements";

describe("scopeNamesService", () => {
  it("matches when the scope names the agreement's service outright", () => {
    expect(scopeNamesService("Annual hot water system service — 250L gas storage", "Hot Water System Service")).toBe(true);
    expect(scopeNamesService("Gas-safety check, annual", "Gas safety check")).toBe(true);
  });

  it("does not match partial words or a different job at the same customer", () => {
    expect(scopeNamesService("Hot water system servicing", "Hot water system service")).toBe(false);
    expect(scopeNamesService("Leaking tap replacement", "Annual gas safety check")).toBe(false);
    expect(scopeNamesService("Anything", "   ")).toBe(false);
  });
});

describe("agreementSnapshot", () => {
  const agreement = {
    id: "sa-1",
    serviceType: "Hot water system service",
    frequency: "12 months",
    nextDueDate: new Date("2027-08-29T00:00:00.000Z"),
  };

  it("claims fulfilment only when the scope names the service", () => {
    expect(agreementSnapshot(agreement, "Hot water system service")).toEqual({
      id: "sa-1",
      service_type: "Hot water system service",
      frequency: "12 months",
      next_due_date: "2027-08-29",
      fulfills_this_job: true,
    });
    expect(agreementSnapshot(agreement, "Blocked drain")?.fulfills_this_job).toBeNull();
  });

  it("is null when the customer has no active agreement", () => {
    expect(agreementSnapshot(undefined, "Blocked drain")).toBeNull();
  });
});

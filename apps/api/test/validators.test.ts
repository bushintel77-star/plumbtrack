import { describe, expect, it } from "vitest";

import { isE164PhoneNumber, isValidAbn, normaliseAuPhoneToE164 } from "../src/lib/validators";

/**
 * P1-9 shared format validators. The ABN cases include real checksum-valid
 * ABNs (the ABR's published sample 51 824 753 556) and single-digit typos,
 * which the checksum must catch.
 */

describe("isValidAbn — ATO checksum", () => {
  it("accepts the ABR's documented sample ABN with formatting", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
  });

  it("rejects a single-digit typo of a valid ABN", () => {
    expect(isValidAbn("51 824 753 557")).toBe(false);
    expect(isValidAbn("51 824 753 555")).toBe(false);
  });

  it("rejects wrong shapes: short, long, non-digits, empty", () => {
    expect(isValidAbn("5182475355")).toBe(false);
    expect(isValidAbn("518247535556")).toBe(false);
    expect(isValidAbn("51 824 753 55A")).toBe(false);
    expect(isValidAbn("")).toBe(false);
  });
});

describe("isE164PhoneNumber", () => {
  it("accepts provider-ready AU numbers", () => {
    expect(isE164PhoneNumber("+61412345678")).toBe(true);
  });

  it("rejects AU-local and junk formats — those never go to the provider as-is", () => {
    expect(isE164PhoneNumber("0412 345 678")).toBe(false);
    expect(isE164PhoneNumber("0412345678")).toBe(false);
    expect(isE164PhoneNumber("+61")).toBe(false);
    expect(isE164PhoneNumber("hello")).toBe(false);
  });
});

describe("normaliseAuPhoneToE164", () => {
  it("lifts AU local formats to +61, dropping the trunk zero", () => {
    expect(normaliseAuPhoneToE164("0412 345 678")).toBe("+61412345678");
    expect(normaliseAuPhoneToE164("(03) 9123 4567")).toBe("+61391234567");
    expect(normaliseAuPhoneToE164("0412345678")).toBe("+61412345678");
  });

  it("already-E.164 input passes through untouched", () => {
    expect(normaliseAuPhoneToE164("+61412345678")).toBe("+61412345678");
  });

  it("returns null for numbers it cannot represent as AU E.164", () => {
    expect(normaliseAuPhoneToE164("12345")).toBeNull();
    expect(normaliseAuPhoneToE164("not a phone")).toBeNull();
  });
});

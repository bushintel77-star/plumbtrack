import { describe, expect, it } from "vitest";
import {
  CALLOUT_FEE,
  RATE_STANDARD,
  formatDuration,
  gstAmount,
  incGst,
  invoiceTotal,
  labourTotal,
  quoteSubtotal,
  totalBilledSeconds,
} from "../src/lib/billing";

describe("formatDuration", () => {
  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats hours, minutes and seconds with padding", () => {
    expect(formatDuration(3723)).toBe("01:02:03");
  });
});

describe("totalBilledSeconds", () => {
  it("sums closed entries and adds running seconds", () => {
    const entries = [
      { start: "2024-01-01T00:00:00.000Z", end: "2024-01-01T00:00:10.000Z" },
      { start: "2024-01-01T00:01:00.000Z", end: null },
    ];
    expect(totalBilledSeconds(entries, 5)).toBe(15);
  });
});

describe("invoice totals", () => {
  it("applies a one-hour minimum and callout fee", () => {
    expect(labourTotal(0)).toBe(RATE_STANDARD);
    expect(invoiceTotal(0)).toBe(RATE_STANDARD + CALLOUT_FEE);
    expect(invoiceTotal(3600)).toBe(RATE_STANDARD + CALLOUT_FEE);
    expect(invoiceTotal(7200)).toBe(RATE_STANDARD * 2 + CALLOUT_FEE);
  });
});

describe("quote totals", () => {
  it("computes subtotal, GST and inc-GST amounts", () => {
    const lines = [
      { qty: 2, rate: 100 },
      { qty: 1, rate: 50 },
    ];
    const subtotal = quoteSubtotal(lines);
    expect(subtotal).toBe(250);
    expect(gstAmount(subtotal)).toBe(25);
    expect(incGst(subtotal)).toBe(275);
  });
});

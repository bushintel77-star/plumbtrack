/**
 * Server-authoritative invoice pricing — the ONE rule for turning accepted
 * quote lines into an amount a customer can be charged.
 *
 *   1. each line is rounded to whole cents first: round(qty × rate × 100)
 *   2. the subtotal is the sum of rounded line cents
 *   3. GST (10%, the legislated AU rate) is computed on the rounded subtotal
 *   4. total = subtotal + GST
 *
 * Clients never submit amounts: they may DISPLAY this math, but only the
 * server's figure is billable. Keep this module the only place the rule
 * lives — HQ and the field app mirror it for display only.
 */

export interface PriceableLine {
  qty: number
  rate: number
}

export const GST_RATE = 0.1

export interface QuoteTotalsCents {
  subtotalCents: number
  gstCents: number
  totalCents: number
}

export function quoteTotalsCents(lines: PriceableLine[]): QuoteTotalsCents {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + Math.round(Number(line.qty) * Number(line.rate) * 100),
    0
  )
  const gstCents = Math.round(subtotalCents * GST_RATE)
  return { subtotalCents, gstCents, totalCents: subtotalCents + gstCents }
}

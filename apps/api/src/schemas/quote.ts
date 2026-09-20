import { z } from "zod";
import { strictObject } from "../lib/validation";

export const quoteStatusSchema = z.enum(["draft", "sent", "accepted"]);

export const quoteLineInputSchema = strictObject({
  desc: z.string().trim().min(1),
  qty: z.number().positive(),
  unit: z.string().trim().min(1),
  rate: z.number().nonnegative(),
});

export const createQuoteSchema = strictObject({
  client: z.string().trim().min(1),
  address: z.string().trim().min(1),
  description: z.string().trim().min(1),
  trade: z.string().trim().min(1).optional().default("plumbing"),
  lines: z.array(quoteLineInputSchema).default([]),
});

export const updateQuoteSchema = strictObject({
  client: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  trade: z.string().trim().min(1).optional(),
  status: quoteStatusSchema.optional(),
  signature: z.string().nullable().optional(),
});

export const updateQuoteLineSchema = strictObject({
  desc: z.string().trim().min(1).optional(),
  qty: z.number().positive().optional(),
  unit: z.string().trim().min(1).optional(),
  rate: z.number().nonnegative().optional(),
});


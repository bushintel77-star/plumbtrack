import { z } from "zod";

/** Mirrors the web client's DocumentCategory union. */
export const documentCategorySchema = z.enum([
  "spec",
  "compliance",
  "warranty",
  "receipt",
  "permit",
  "insurance",
  "supplier",
  "other",
]);

/** One uploaded revision of a document. */
export const documentVersionSchema = z.object({
  fileName: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1),
  url: z.string().trim().min(1),
  sha256: z.string().trim().min(1).optional(),
  uploadedAt: z.string().datetime(),
  uploadedBy: z.string().trim().min(1),
});

export const createDocumentSchema = z.object({
  name: z.string().trim().min(1),
  category: documentCategorySchema,
  /** Job id when the doc belongs to a job; omitted for company documents. */
  jobId: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional().default([]),
  /** ISO date (YYYY-MM-DD) for compliance docs; null for evergreen. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).optional().default(""),
  createdBy: z.string().trim().min(1),
  /** The first revision of the document. */
  currentVersion: documentVersionSchema,
  versions: z.array(documentVersionSchema).optional(),
});

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: documentCategorySchema.optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const addDocumentVersionSchema = z.object({
  version: documentVersionSchema,
});

export const createRfiSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  attachmentId: z.string().trim().min(1).nullable().optional(),
  raisedBy: z.string().trim().min(1),
});

export const updateRfiSchema = z.object({
  /** Answer text — moving the RFI from raised → answered. */
  answer: z.string().trim().min(1).max(4000).optional(),
  answeredBy: z.string().trim().min(1).optional(),
  /** Explicitly seal a resolved request. */
  status: z.enum(["closed"]).optional(),
});

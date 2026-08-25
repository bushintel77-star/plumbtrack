import { z } from "zod";

export const createUploadIntentSchema = z.object({
  jobId: z.string().trim().min(1),
  opId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(40),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|heic)$/i, "Only supported image types may be uploaded"),
  byteSize: z.number().int().positive().max(15 * 1024 * 1024, "Image must be 15 MB or smaller"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export const completeUploadSchema = z.object({
  assetId: z.string().trim().min(1),
});


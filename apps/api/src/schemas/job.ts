import { z } from "zod";

export const jobStatusSchema = z.enum(["scheduled", "in_progress", "completed"]);

export const createJobSchema = z.object({
  client: z.string().trim().min(1),
  address: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  phone: z.string().trim().min(1).optional(),
  accessCode: z.string().trim().min(1).optional(),
  trade: z.string().trim().min(1).optional().default("plumbing"),
  customerId: z.string().trim().min(1).optional(),
  propertyId: z.string().trim().min(1).optional(),
  status: jobStatusSchema.optional().default("scheduled"),
});

export const updateJobSchema = z.object({
  client: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  accessCode: z.string().trim().min(1).nullable().optional(),
  trade: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).nullable().optional(),
  propertyId: z.string().trim().min(1).nullable().optional(),
  status: jobStatusSchema.optional(),
  signature: z.string().nullable().optional(),
});

export const createTimeEntrySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  /** Idempotency key from the client's offline queue — replays are safe. */
  opId: z.string().trim().min(1).optional(),
  lat: z.number().finite().gte(-90).lte(90).nullable().optional(),
  lng: z.number().finite().gte(-180).lte(180).nullable().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable().optional(),
});

export const updateTimeEntrySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().nullable(),
});

export const createPhotoSchema = z.object({
  label: z.string().trim().min(1),
  url: z.string().trim().min(1),
  /** Client outbox key used to make upload retries idempotent. */
  opId: z.string().trim().min(1).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

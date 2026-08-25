import { z } from "zod";

export const createNotificationSchema = z.object({
  channel: z.string().trim().min(1),
  author: z.string().trim().min(1),
  text: z.string().trim().min(1),
  /** Client outbox key used to make offline replays idempotent. */
  opId: z.string().trim().min(1).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

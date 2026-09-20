import { z } from "zod";
import { strictObject } from "../lib/validation";

export const createNotificationSchema = strictObject({
  channel: z.string().trim().min(1),
  author: z.string().trim().min(1),
  text: z.string().trim().min(1),
  /** Client outbox key used to make offline replays idempotent. */
  opId: z.string().trim().min(1).optional(),
});


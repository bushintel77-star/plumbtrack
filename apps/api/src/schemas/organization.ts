import { z } from "zod";
import { strictObject } from "../lib/validation";

export const createOrganizationSchema = strictObject({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
  trade: z.string().trim().min(1).optional().default("plumbing"),
});


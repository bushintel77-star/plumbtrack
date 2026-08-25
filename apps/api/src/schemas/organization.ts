import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
  trade: z.string().trim().min(1).optional().default("plumbing"),
});


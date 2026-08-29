import { z } from "zod"

export const assignmentSchema = z.object({
  technicianId: z.string().min(1),
  startBlock: z.number().int().min(0).max(19)
})

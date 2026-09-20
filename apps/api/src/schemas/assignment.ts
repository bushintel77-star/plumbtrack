import { z } from "zod"
import { strictObject } from "../lib/validation"

export const assignmentSchema = strictObject({
  technicianId: z.string().min(1),
  startBlock: z.number().int().min(0).max(19)
})

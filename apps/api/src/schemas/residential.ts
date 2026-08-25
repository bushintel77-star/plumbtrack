import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().email().optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createPropertySchema = z.object({
  address: z.string().trim().min(1).max(240),
  accessCode: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export const appointmentStatusSchema = z.enum([
  "assigned",
  "en_route",
  "arrived",
  "working",
  "awaiting_customer",
  "awaiting_parts",
  "complete",
  "cancelled",
]);

export const createAppointmentSchema = z.object({
  jobId: z.string().trim().min(1),
  assignedStaffId: z.string().trim().min(1).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional(),
  status: appointmentStatusSchema.optional().default("assigned"),
});

export const updateAppointmentSchema = z.object({
  assignedStaffId: z.string().trim().min(1).nullable().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  status: appointmentStatusSchema.optional(),
});

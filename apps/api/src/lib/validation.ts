import type { FastifyReply } from "fastify";
import { z, type ZodError, type ZodType, type ZodTypeDef } from "zod";

/** Every request schema uses this instead of z.object (P1-9): unknown fields
 *  are rejected with a 400 naming the offending key, instead of being
 *  silently dropped — a typo'd or malicious extra field must never vanish
 *  into a 2xx. */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

export function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: ZodError };

export function parseBody<Output, Input = Output>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  body: unknown,
): ParseResult<Output> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error };
}

export function sendValidationError(reply: FastifyReply, error: ZodError): FastifyReply {
  return reply.code(400).send({
    statusCode: 400,
    error: "Bad Request",
    message: "Request body validation failed",
    issues: formatZodError(error),
  });
}

import type { FastifyReply } from "fastify";
import type { ZodError, ZodType, ZodTypeDef } from "zod";

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

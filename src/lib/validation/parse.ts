import type { z } from "zod";

/** Key used for errors that do not belong to a single field. */
export const FORM_ERROR_KEY = "form";

/**
 * Flattens zod issues into `{ "field": "first message" }` (nested paths joined with ".", e.g.
 * "allocations.0.amount"). Safe to use in client components.
 */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length === 0 ? FORM_ERROR_KEY : issue.path.map(String).join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: Record<string, string> };

/** Parses `input` with `schema`, returning either the typed output or flattened field errors. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, fieldErrors: fieldErrorsFromZod(result.error) };
}

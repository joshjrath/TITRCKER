import "server-only";

import { DrizzleQueryError } from "drizzle-orm";
import type { z } from "zod";

import type { ActionErrorCode, ActionResult } from "@/lib/action-result";
import { parseWith } from "@/lib/validation/parse";
import { logEvent } from "@/server/log";

/** A business-rule failure with a user-facing message (safe to show) and optional per-field messages. */
export class ServiceError extends Error {
  readonly code: ActionErrorCode;
  readonly fieldErrors: Record<string, string> | undefined;

  constructor(code: ActionErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const VALIDATION_MESSAGE = "Please check the highlighted fields.";

export function validationError(fieldErrors: Record<string, string>, message = VALIDATION_MESSAGE): ServiceError {
  return new ServiceError("validation", message, fieldErrors);
}

export function notFoundError(message = "That record could not be found. It may have been deleted."): ServiceError {
  return new ServiceError("not_found", message);
}

export function staleError(
  message = "This record changed since you opened it. Reload to see the latest version, then try again.",
): ServiceError {
  return new ServiceError("stale", message);
}

/** Parses an action input with its shared zod schema; throws a `validation` ServiceError on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = parseWith(schema, input);
  if (!result.ok) throw validationError(result.fieldErrors);
  return result.data;
}

/** Extracts the Postgres SQLSTATE (and constraint name) from a driver error, unwrapping Drizzle's wrapper. */
export function pgErrorInfo(err: unknown): { code: string; constraint: string | null } | null {
  const candidate: unknown = err instanceof DrizzleQueryError ? err.cause : err;
  if (typeof candidate !== "object" || candidate === null) return null;
  const { code, constraint } = candidate as { code?: unknown; constraint?: unknown };
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return null;
  return { code, constraint: typeof constraint === "string" ? constraint : null };
}

/** Maps database errors that can legitimately reach users to friendly ServiceErrors. */
function fromDatabaseError(err: unknown): ServiceError | null {
  const info = pgErrorInfo(err);
  if (!info) return null;
  switch (info.code) {
    case "23514": // check_violation (incl. the allocation-sum constraint trigger)
    case "22003": // numeric_value_out_of_range
      return new ServiceError("validation", "Those values aren't allowed. Please check the amounts and try again.");
    case "23505": // unique_violation
      return new ServiceError("conflict", "That change conflicts with an existing record. Reload and try again.");
    case "23503": // foreign_key_violation
      return notFoundError();
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
    case "55P03": // lock_not_available
    case "57014": // query_canceled (statement_timeout)
      return new ServiceError("conflict", "The server was busy with another change. Please try again.");
    default:
      return null;
  }
}

/**
 * Converts any thrown value into a failed ActionResult. ServiceErrors keep their code/message; known
 * database errors get friendly messages; everything else becomes `server_error`. Logs only the operation
 * name and error codes — never amounts, notes, sources, emails or SQL parameters.
 */
export function toActionError(err: unknown, operation: string): Extract<ActionResult<never>, { ok: false }> {
  const serviceError = err instanceof ServiceError ? err : fromDatabaseError(err);
  if (serviceError) {
    if (serviceError.code === "server_error" || serviceError.code === "conflict") {
      const info = pgErrorInfo(err);
      logEvent("warn", "service.rejected", { operation, code: serviceError.code, pg: info?.code ?? null });
    }
    return serviceError.fieldErrors
      ? { ok: false, code: serviceError.code, message: serviceError.message, fieldErrors: serviceError.fieldErrors }
      : { ok: false, code: serviceError.code, message: serviceError.message };
  }
  const info = pgErrorInfo(err);
  logEvent("error", "service.failed", {
    operation,
    pg: info?.code ?? null,
    constraint: info?.constraint ?? null,
    error: err instanceof Error ? err.name : typeof err,
  });
  return { ok: false, code: "server_error", message: "Something went wrong on our side. Nothing was saved." };
}

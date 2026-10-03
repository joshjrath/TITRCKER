export type ActionErrorCode =
  | "unauthorized"
  | "validation"
  | "not_found"
  | "conflict"
  | "stale"
  | "idempotency_conflict"
  | "rate_limited"
  | "limit_exceeded"
  | "server_error";

export type ActionResult<T> =
  | { ok: true; data: T; message: string }
  | { ok: false; code: ActionErrorCode; message: string; fieldErrors?: Record<string, string> };

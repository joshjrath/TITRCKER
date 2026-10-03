/**
 * Last-line log redaction for errors the app does not catch itself.
 *
 * The app's own logging (src/server/log.ts) never writes amounts, notes, sources or emails. But an error that escapes
 * to the framework (e.g. a database failure while a Server Component renders a read model) is printed by Next.js with
 * console.error, and Drizzle's DrizzleQueryError message embeds the SQL *parameters* ("Failed query: ... params:
 * 12345,Salary,..."), while node-postgres errors carry `detail` ("Failing row contains (...)"), `where` and similar
 * fields that util.inspect prints. installLogRedaction() wraps console.error/console.warn so such values are replaced
 * by a short, data-free description (error class + SQLSTATE) before anything reaches the log stream.
 *
 * Pure and dependency-free (unit-tested); installed from src/instrumentation.ts in production.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** DrizzleQueryError (query + params) or a node-postgres DatabaseError (SQLSTATE code + severity/detail). */
function isSensitiveDbError(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if ("params" in value && "query" in value) return true;
  const code = value.code;
  return typeof code === "string" && SQLSTATE.test(code) && ("severity" in value || "detail" in value || "routine" in value);
}

/** The SQLSTATE of the first database error in the cause chain, if any. */
function sqlState(value: unknown): string | null {
  let current: unknown = value;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isRecord(current); depth += 1) {
    const code = current.code;
    if (typeof code === "string" && SQLSTATE.test(code)) return code;
    current = current.cause;
  }
  return null;
}

/** True when `value` or anything in its cause chain is a database error that may carry row data. */
function chainHasSensitiveDbError(value: unknown): boolean {
  let current: unknown = value;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isRecord(current); depth += 1) {
    if (isSensitiveDbError(current)) return true;
    current = current.cause;
  }
  return false;
}

/** Strips a Drizzle "params:" tail from a message string. */
function redactString(value: string): string {
  const at = value.search(/\bparams: /);
  return at === -1 ? value : `${value.slice(0, at)}params: [redacted]`;
}

/**
 * Returns a log-safe replacement for one console argument. Database errors (or errors caused by one) become a short
 * string naming only the error class, SQLSTATE and Next.js digest; strings lose any Drizzle "params:" tail; everything
 * else is returned unchanged.
 */
export function redactLogArgument(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (!chainHasSensitiveDbError(value)) return value;
  const record = value as Record<string, unknown>;
  const name = value instanceof Error ? value.name : "Error";
  const state = sqlState(value);
  const digest = typeof record.digest === "string" ? record.digest : null;
  return `[${name}: database error${state ? ` ${state}` : ""} (details redacted)${digest ? ` digest=${digest}` : ""}]`;
}

type ConsoleMethod = (...args: unknown[]) => void;
const INSTALLED = Symbol.for("tenth.logRedactionInstalled");

/** Wraps console.error and console.warn with {@link redactLogArgument}. Idempotent. */
export function installLogRedaction(target: Console = console): void {
  const flagged = target as Console & { [INSTALLED]?: boolean };
  if (flagged[INSTALLED]) return;
  for (const method of ["error", "warn"] as const) {
    const original = target[method].bind(target) as ConsoleMethod;
    target[method] = ((...args: unknown[]) => original(...args.map(redactLogArgument))) as Console[typeof method];
  }
  flagged[INSTALLED] = true;
}

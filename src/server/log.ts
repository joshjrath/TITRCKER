import "server-only";

/** Metadata allowed in logs: identifiers, operation names, durations, error codes. Never amounts, notes, sources or emails. */
export type SafeLogMeta = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: "info" | "warn" | "error", event: string, meta: SafeLogMeta = {}): void {
  const line = JSON.stringify({ level, event, ...meta, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

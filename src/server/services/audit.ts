import "server-only";

import { auditEvent, type AuditAction, type AuditEntityType } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

export interface AuditEntry {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** Row snapshot before the change (null for create). */
  before?: unknown;
  /** Row snapshot after the change. */
  after?: unknown;
  reason?: string | null;
}

/** JSON-safe copy of a row snapshot (Dates become ISO strings). */
function toJson(value: unknown): unknown {
  return value === undefined || value === null ? null : (JSON.parse(JSON.stringify(value)) as unknown);
}

/** Appends one audit event in the caller's transaction. audit_event is append-only (RLS: SELECT + INSERT). */
export async function appendAudit(tx: OwnerTx, ownerId: string, entry: AuditEntry): Promise<void> {
  await tx.insert(auditEvent).values({
    ownerId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: toJson(entry.before),
    after: toJson(entry.after),
    reason: entry.reason ?? null,
  });
}

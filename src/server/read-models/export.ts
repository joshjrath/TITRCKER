import "server-only";

import { backupFileName, buildBackup, buildLedgerCsv, type BackupV1 } from "@/domain";
import { withOwnerSnapshot } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";
import { loadFullHistory } from "@/server/services/snapshot";

import { loadComputedLedgerTx } from "./common";
import { loadAccount } from "./settings";

export interface CsvExport {
  filename: string;
  /** CSV text with a UTF-8 BOM (Excel) and CRLF line endings. */
  body: string;
}

export interface BackupExport {
  filename: string;
  backup: BackupV1;
}

/** `tenth-ledger-YYYY-MM-DD.csv` */
export function ledgerCsvFileName(today: string): string {
  return `tenth-ledger-${today}.csv`;
}

/** Full reconciliation CSV of the owner's active records (domain buildLedgerCsv), with summary rows per currency. */
export async function buildCsvExport(ctx: ServiceContext): Promise<CsvExport> {
  const ledger = await withOwnerSnapshot(ctx.ownerId, (tx) => loadComputedLedgerTx(tx, ctx));
  const body = buildLedgerCsv(
    ledger.snapshot,
    ledger.balances,
    { exportedAt: ctx.now.toISOString(), timeZone: ledger.tracking.timeZone },
    { bom: true },
  );
  return { filename: ledgerCsvFileName(ledger.today), body };
}

/**
 * JSON backup: full history including soft-deleted and reversed records plus the audit trail (with before/after
 * snapshots); totals are computed from the active records only. Read in one owner-scoped transaction so it is a
 * consistent snapshot.
 */
export async function buildBackupExport(ctx: ServiceContext): Promise<BackupExport> {
  return withOwnerSnapshot(ctx.ownerId, async (tx) => {
    const ledger = await loadComputedLedgerTx(tx, ctx);
    const history = await loadFullHistory(tx, ctx.ownerId);
    const account = await loadAccount(tx, ctx.ownerId);
    const row = history.settingsRow;
    const backup = buildBackup({
      exportedAt: ctx.now.toISOString(),
      accountEmail: account.email,
      settings: {
        trackingStart: ledger.tracking.trackingStart,
        timeZone: ledger.tracking.timeZone,
        displayCurrency: ledger.tracking.displayCurrency,
        churchName: row.churchName,
        nextPayoutDate: ledger.tracking.nextPayoutDate,
        nextPayoutIsDefault: ledger.tracking.nextPayoutIsDefault,
      },
      records: history.records,
      balances: ledger.balances,
      auditEvents: history.auditEvents,
    });
    return { filename: backupFileName(ledger.today), backup };
  });
}

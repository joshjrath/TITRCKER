/**
 * Versioned JSON backup (format `tenth-backup`, version 1).
 *
 * The backup contains every record including soft-deleted / reversed ones (with their deletion
 * metadata), the policy in force, per-currency totals for reconciliation and the full audit trail
 * (including each event's before/after snapshots). Amounts are integer minor units in their original currency.
 */
import { CURRENCIES, ROUNDING_POLICY, TITHE_RATE_BPS, type Currency, type RoundingPolicy } from './constants';
import type { LocalDate } from './dates';
import type { Minor } from './money';
import type { CurrencyBalance } from './balances';
import type {
  AdjustmentRecord,
  IncomeRecord,
  OpeningObligationRecord,
  PaymentRecord,
  SetAsideRecord,
} from './records';

export const BACKUP_FORMAT = 'tenth-backup' as const;
export const BACKUP_VERSION = 1 as const;

export interface SoftDeleted {
  deletedAt: string | null;
  deletedReason: string | null;
}

export interface BackupSettings {
  trackingStart: LocalDate;
  timeZone: string;
  displayCurrency: Currency;
  churchName: string | null;
  nextPayoutDate: LocalDate;
  nextPayoutIsDefault: boolean;
}

export interface BackupTotals {
  accruedMinor: Minor;
  paidMinor: Minor;
  stillToGiveMinor: Minor;
  creditMinor: Minor;
  setAsideMinor: Minor;
}

/** Any JSON value (audit snapshots are stored as jsonb). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface BackupAuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  createdAt: string;
  /** The record as it was before the change (null for a create). */
  before: JsonValue | null;
  /** The record after the change (null when the action recorded no new state). */
  after: JsonValue | null;
}

export interface BackupRecords {
  incomes: (IncomeRecord & SoftDeleted)[];
  adjustments: (AdjustmentRecord & SoftDeleted)[];
  openings: (OpeningObligationRecord & SoftDeleted)[];
  payments: (PaymentRecord & { reversedAt: string | null; reversalReason: string | null })[];
  setAsides: (SetAsideRecord & SoftDeleted)[];
}

export interface BackupV1 {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  account: { email: string };
  settings: BackupSettings;
  policy: { titheRateBps: number; roundingPolicy: RoundingPolicy; currencies: Currency[] };
  records: BackupRecords;
  totals: Record<Currency, BackupTotals>;
  auditEvents: BackupAuditEvent[];
}

/** Copies every record (and each payment's allocations) so the backup never aliases caller data. */
function copyRecords(records: BackupRecords): BackupRecords {
  return {
    incomes: records.incomes.map((r) => ({ ...r })),
    adjustments: records.adjustments.map((r) => ({ ...r })),
    openings: records.openings.map((r) => ({ ...r })),
    payments: records.payments.map((r) => ({ ...r, allocations: r.allocations.map((a) => ({ ...a })) })),
    setAsides: records.setAsides.map((r) => ({ ...r })),
  };
}

/**
 * Assembles a backup document. `balances` must be computed from the active records only. The
 * result is an independent copy: later changes to the inputs never alter an assembled backup.
 */
export function buildBackup(input: {
  exportedAt: string;
  accountEmail: string;
  settings: BackupSettings;
  records: BackupRecords;
  balances: Record<Currency, CurrencyBalance>;
  auditEvents: readonly BackupAuditEvent[];
}): BackupV1 {
  const totals = {} as Record<Currency, BackupTotals>;
  for (const currency of CURRENCIES) {
    const b = input.balances[currency];
    totals[currency] = {
      accruedMinor: b.accruedMinor,
      paidMinor: b.paidMinor,
      stillToGiveMinor: b.stillToGiveMinor,
      creditMinor: b.creditMinor,
      setAsideMinor: b.setAsideMinor,
    };
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt,
    account: { email: input.accountEmail },
    settings: { ...input.settings },
    policy: { titheRateBps: TITHE_RATE_BPS, roundingPolicy: ROUNDING_POLICY, currencies: [...CURRENCIES] },
    records: copyRecords(input.records),
    totals,
    auditEvents: input.auditEvents.map((event) => ({
      ...event,
      before: structuredClone(event.before),
      after: structuredClone(event.after),
    })),
  };
}

/** True when `value` looks like a Tenth v1 backup header (format and version only). */
export function isBackupV1Header(value: unknown): value is Pick<BackupV1, 'format' | 'version'> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { format?: unknown; version?: unknown };
  return candidate.format === BACKUP_FORMAT && candidate.version === BACKUP_VERSION;
}

/** Suggested download file name, e.g. `tenth-backup-2026-10-03.json`. */
export function backupFileName(today: LocalDate): string {
  return `${BACKUP_FORMAT}-${today}.json`;
}

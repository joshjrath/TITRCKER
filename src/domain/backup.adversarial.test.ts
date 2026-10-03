/**
 * Adversarial tests for the JSON backup: totals reconcile for every currency, deleted / reversed
 * records survive with their metadata, the document survives a JSON round trip, and building it
 * never mutates or aliases the caller's data.
 */
import { describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { backupFileName, buildBackup, isBackupV1Header, type BackupAuditEvent, type BackupRecords } from './backup';
import { toLocalDate } from './dates';
import { income, m, opening, payment, setAside, snapshot } from './testFixtures';

function fixture() {
  const cad = income({ amount: '1,750.00', on: '2026-10-03', note: '=cmd' });
  const usd = income({ amount: '500.00', on: '2026-10-04', currency: 'USD' });
  const deleted = income({ amount: '99.00', on: '2026-10-04' });
  const pay = payment({ amount: '200.00', on: '2026-10-05', allocations: [[2026, '175.00']] });
  const reversed = payment({ amount: '10.00', on: '2026-10-05', allocations: [[2026, '10.00']] });
  const open = opening({ amount: '30.00', on: '2025-02-01', currency: 'USD' });
  const reserve = setAside({ kind: 'reserve', amount: '20.00', on: '2026-10-06', currency: 'USD' });
  const active = snapshot({ incomes: [cad, usd], payments: [pay], openings: [open], setAsides: [reserve] });
  const records: BackupRecords = {
    incomes: [
      { ...cad, deletedAt: null, deletedReason: null },
      { ...usd, deletedAt: null, deletedReason: null },
      { ...deleted, deletedAt: '2026-10-05T00:00:00.000Z', deletedReason: 'duplicate' },
    ],
    adjustments: [],
    openings: [{ ...open, deletedAt: null, deletedReason: null }],
    payments: [
      { ...pay, reversedAt: null, reversalReason: null },
      { ...reversed, reversedAt: '2026-10-06T00:00:00.000Z', reversalReason: 'typo' },
    ],
    setAsides: [{ ...reserve, deletedAt: null, deletedReason: null }],
  };
  const input = {
    exportedAt: '2026-10-07T00:00:00.000Z',
    accountEmail: 'owner@example.com',
    settings: {
      trackingStart: toLocalDate('2026-10-03'),
      timeZone: 'Pacific/Kiritimati',
      displayCurrency: 'USD' as const,
      churchName: null,
      nextPayoutDate: toLocalDate('2026-12-31'),
      nextPayoutIsDefault: true,
    },
    records,
    balances: computeBalances(active, toLocalDate('2026-10-03')),
    auditEvents: [
      {
        id: 'ev-1',
        entityType: 'church_payment',
        entityId: reversed.id,
        action: 'reverse',
        reason: 'typo',
        createdAt: '2026-10-06T00:00:00.000Z',
        before: { reversedAt: null, allocations: [{ bucketYear: 2026, amountMinor: 5000 }] },
        after: { reversedAt: '2026-10-06T00:00:00.000Z', allocations: [{ bucketYear: 2026, amountMinor: 5000 }] },
      },
    ] as BackupAuditEvent[],
  };
  return { input, active };
}

describe('buildBackup', () => {
  it('reports per-currency totals equal to the active balances, credit included', () => {
    const { input } = fixture();
    const backup = buildBackup(input);
    expect(backup.totals.CAD).toEqual({ accruedMinor: m('175.00'), paidMinor: m('200.00'), stillToGiveMinor: 0, creditMinor: m('25.00'), setAsideMinor: 0 });
    expect(backup.totals.USD).toEqual({ accruedMinor: m('80.00'), paidMinor: 0, stillToGiveMinor: m('80.00'), creditMinor: 0, setAsideMinor: m('20.00') });
    for (const currency of ['CAD', 'USD'] as const) {
      const t = backup.totals[currency];
      expect(t.stillToGiveMinor - t.creditMinor).toBe(t.accruedMinor - t.paidMinor);
    }
  });

  it('keeps deleted and reversed records with their metadata, verbatim user text, and survives JSON', () => {
    const { input } = fixture();
    const backup = buildBackup(input);
    expect(backup.records.incomes.map((r) => r.deletedReason)).toEqual([null, null, 'duplicate']);
    expect(backup.records.payments.map((r) => r.reversalReason)).toEqual([null, 'typo']);
    expect(backup.records.incomes[0]?.note).toBe('=cmd'); // JSON is not a spreadsheet: no neutralisation
    const roundTripped: unknown = JSON.parse(JSON.stringify(backup));
    expect(roundTripped).toEqual(backup);
    expect(isBackupV1Header(roundTripped)).toBe(true);
  });

  it('does not mutate the input, and later edits to the input do not leak into the backup', () => {
    const { input } = fixture();
    const before = JSON.stringify(input);
    const backup = buildBackup(input);
    expect(JSON.stringify(input)).toBe(before);
    const snapshotOfBackup = JSON.stringify(backup);
    input.records.incomes.push({ ...input.records.incomes[0]!, id: 'late' });
    input.settings.timeZone = 'UTC';
    input.auditEvents.push({ ...input.auditEvents[0]!, id: 'ev-2' });
    const after = input.auditEvents[0]!.after as { allocations: { amountMinor: number }[] };
    after.allocations[0]!.amountMinor = 1; // nested audit snapshots are copied, not aliased
    expect(JSON.stringify(backup)).toBe(snapshotOfBackup);
  });

  it('recognises only an exact v1 header', () => {
    expect(isBackupV1Header({ format: 'tenth-backup', version: 1 })).toBe(true);
    expect(isBackupV1Header({ format: 'tenth-backup', version: '1' })).toBe(false);
    expect(isBackupV1Header({ format: 'Tenth-Backup', version: 1 })).toBe(false);
    expect(isBackupV1Header([])).toBe(false);
    expect(isBackupV1Header(undefined)).toBe(false);
  });

  it('names the file by the local date', () => {
    expect(backupFileName(toLocalDate('2027-01-01'))).toBe('tenth-backup-2027-01-01.json');
  });
});

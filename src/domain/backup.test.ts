import { describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { backupFileName, BACKUP_FORMAT, BACKUP_VERSION, buildBackup, isBackupV1Header } from './backup';
import { computeBalances } from './balances';
import { income, m, payment, snapshot } from './testFixtures';

describe('backup', () => {
  it('builds a versioned document with policy and reconciling totals', () => {
    const inc = income({ amount: '1,750.00', on: '2026-10-03' });
    const deletedInc = income({ amount: '99.00', on: '2026-10-04' });
    const pay = payment({ amount: '50.00', on: '2026-10-05', allocations: [[2026, '50.00']] });
    const active = snapshot({ incomes: [inc], payments: [pay] });
    const backup = buildBackup({
      exportedAt: '2026-10-06T00:00:00.000Z',
      accountEmail: 'owner@example.com',
      settings: {
        trackingStart: toLocalDate('2026-10-03'),
        timeZone: 'America/Toronto',
        displayCurrency: 'CAD',
        churchName: 'Grace Church',
        nextPayoutDate: toLocalDate('2026-12-31'),
        nextPayoutIsDefault: true,
      },
      records: {
        incomes: [
          { ...inc, deletedAt: null, deletedReason: null },
          { ...deletedInc, deletedAt: '2026-10-05T00:00:00.000Z', deletedReason: 'duplicate' },
        ],
        adjustments: [],
        openings: [],
        payments: [{ ...pay, reversedAt: null, reversalReason: null }],
        setAsides: [],
      },
      balances: computeBalances(active, toLocalDate('2026-10-03')),
      auditEvents: [{ id: 'ev-1', entityType: 'income_entry', entityId: inc.id, action: 'create', reason: null, createdAt: inc.createdAt }],
    });
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.policy).toEqual({ titheRateBps: 1000, roundingPolicy: 'HALF_UP_PER_ENTRY_MINOR', currencies: ['CAD', 'USD'] });
    expect(backup.totals.CAD).toEqual({
      accruedMinor: m('175.00'),
      paidMinor: m('50.00'),
      stillToGiveMinor: m('125.00'),
      creditMinor: 0,
      setAsideMinor: 0,
    });
    expect(backup.records.incomes).toHaveLength(2);
    expect(isBackupV1Header(JSON.parse(JSON.stringify(backup)))).toBe(true);
  });

  it('recognises only v1 headers', () => {
    expect(isBackupV1Header({ format: 'tenth-backup', version: 2 })).toBe(false);
    expect(isBackupV1Header(null)).toBe(false);
    expect(isBackupV1Header('tenth-backup')).toBe(false);
  });

  it('names the file by date', () => {
    expect(backupFileName(toLocalDate('2026-10-03'))).toBe('tenth-backup-2026-10-03.json');
  });
});

/**
 * Test-only builders for domain records. Not exported from the domain index.
 * Amounts are given as strict amount strings ("1,750.00") and parsed with the real parser.
 */
import { ROUNDING_POLICY, TITHE_RATE_BPS, type Currency } from './constants';
import { toLocalDate, type LocalDate } from './dates';
import { parseAmount, toMinor, type Minor } from './money';
import type {
  AdjustmentRecord,
  IncomeRecord,
  LedgerSnapshot,
  OpeningObligationRecord,
  PaymentRecord,
  SetAsideRecord,
} from './records';
import { computeTithe } from './tithe';

/** Parses a strict amount string (or passes a raw minor number through). */
export function m(amount: string | number): Minor {
  if (typeof amount === 'number') return toMinor(amount);
  const parsed = parseAmount(amount);
  if (!parsed.ok) throw new Error(`Bad test amount ${amount}: ${parsed.error}`);
  return parsed.minor;
}

export const d = (s: string): LocalDate => toLocalDate(s);

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}-${String(++sequence).padStart(4, '0')}`;
const nextCreatedAt = (): string => new Date(Date.UTC(2026, 0, 1) + ++sequence * 1000).toISOString();

export function resetFixtureSequence(): void {
  sequence = 0;
}

export function income(o: {
  amount: string | number;
  on: string;
  currency?: Currency;
  id?: string;
  source?: string | null;
  category?: string | null;
  note?: string | null;
  createdAt?: string;
}): IncomeRecord {
  const amountMinor = m(o.amount);
  const createdAt = o.createdAt ?? nextCreatedAt();
  return {
    id: o.id ?? nextId('inc'),
    currency: o.currency ?? 'CAD',
    amountMinor,
    receivedOn: d(o.on),
    titheRateBps: TITHE_RATE_BPS,
    roundingPolicy: ROUNDING_POLICY,
    titheMinor: computeTithe(amountMinor),
    source: o.source ?? null,
    category: o.category ?? null,
    note: o.note ?? null,
    createdAt,
    updatedAt: createdAt,
    version: 1,
  };
}

export function adjustment(o: {
  incomeId: string;
  amount: string | number;
  on: string;
  id?: string;
  kind?: 'refund' | 'correction';
  reason?: string;
  createdAt?: string;
}): AdjustmentRecord {
  return {
    id: o.id ?? nextId('adj'),
    incomeId: o.incomeId,
    kind: o.kind ?? 'refund',
    amountMinor: m(o.amount),
    effectiveOn: d(o.on),
    reason: o.reason ?? 'Refund',
    createdAt: o.createdAt ?? nextCreatedAt(),
  };
}

export function opening(o: {
  amount: string | number;
  on: string;
  currency?: Currency;
  id?: string;
  label?: string;
  note?: string | null;
}): OpeningObligationRecord {
  return {
    id: o.id ?? nextId('open'),
    currency: o.currency ?? 'CAD',
    amountMinor: m(o.amount),
    effectiveOn: d(o.on),
    label: o.label ?? 'Opening balance',
    note: o.note ?? null,
    createdAt: nextCreatedAt(),
    version: 1,
  };
}

export function payment(o: {
  amount: string | number;
  on: string;
  allocations?: [number, string | number][];
  currency?: Currency;
  id?: string;
  churchName?: string;
  reference?: string | null;
  note?: string | null;
}): PaymentRecord {
  return {
    id: o.id ?? nextId('pay'),
    currency: o.currency ?? 'CAD',
    amountMinor: m(o.amount),
    paidOn: d(o.on),
    churchName: o.churchName ?? 'Grace Church',
    reference: o.reference ?? null,
    note: o.note ?? null,
    createdAt: nextCreatedAt(),
    version: 1,
    allocations: (o.allocations ?? []).map(([bucketYear, amount]) => ({ bucketYear, amountMinor: m(amount) })),
  };
}

export function setAside(o: {
  kind: 'reserve' | 'release';
  amount: string | number;
  on: string;
  currency?: Currency;
  id?: string;
  note?: string | null;
  paymentId?: string | null;
  createdAt?: string;
}): SetAsideRecord {
  return {
    id: o.id ?? nextId('sa'),
    currency: o.currency ?? 'CAD',
    kind: o.kind,
    amountMinor: m(o.amount),
    effectiveOn: d(o.on),
    note: o.note ?? null,
    paymentId: o.paymentId ?? null,
    createdAt: o.createdAt ?? nextCreatedAt(),
  };
}

export function snapshot(partial: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    incomes: partial.incomes ?? [],
    adjustments: partial.adjustments ?? [],
    openings: partial.openings ?? [],
    payments: partial.payments ?? [],
    setAsides: partial.setAsides ?? [],
  };
}

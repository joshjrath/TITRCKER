/**
 * Balances, buckets and credit, per currency (ARCHITECTURE §3.6–3.7).
 *
 * - accrued = Σ obligation events; paid = Σ active payments.
 * - Still to give = max(0, accrued − paid); Credit = max(0, paid − accrued), shown explicitly.
 * - Per bucket (currency, year): position = accrued_b − allocated_b.
 *   Credit pool = unallocated payment remainders + Σ over-covered buckets (allocated_b − accrued_b > 0).
 *   The pool is applied deterministically to buckets with positive position, oldest first:
 *   outstanding_b = max(0, position_b − credit_applied_b).
 * - Invariants (asserted on every computation): Σ outstanding_b = still to give and
 *   remaining pool = credit. CAD and USD are computed completely independently.
 */
import { CURRENCIES, type Currency } from './constants';
import { yearOf, type LocalDate } from './dates';
import {
  addMinor,
  clampZero,
  minMinor,
  subMinor,
  sumMinor,
  ZERO,
  type Minor,
} from './money';
import { deriveObligationEvents, type ObligationEvent } from './obligations';
import { allTimeRange, periodRangeForYear, type PeriodKey, type PeriodRange } from './periods';
import { adjustmentsByIncome, type LedgerSnapshot } from './records';
import { setAsideBalance, stillToSetAside } from './setAside';

export interface BucketPosition {
  currency: Currency;
  year: number;
  range: PeriodRange;
  /** Σ income amounts received in the bucket. */
  grossIncomeMinor: Minor;
  /** Σ adjustment amounts effective in the bucket. */
  refundedMinor: Minor;
  /** gross − refunded (may be negative when a refund lands in a later year than its income). */
  netIncomeMinor: Minor;
  /** Σ income tithe. */
  incomeTitheMinor: Minor;
  /** Σ adjustment tithe deltas (<= 0). */
  adjustmentTitheMinor: Minor;
  /** Σ opening obligations. */
  openingMinor: Minor;
  /** incomeTithe + adjustmentTithe + opening (may be negative). */
  accruedMinor: Minor;
  /** Σ explicit allocations from active payments. */
  allocatedMinor: Minor;
  /** Derived share of the credit pool applied here (>= 0). */
  creditAppliedMinor: Minor;
  /** max(0, allocated − accrued). */
  overCoveredMinor: Minor;
  /** max(0, accrued − allocated − creditApplied). */
  outstandingMinor: Minor;
}

export interface CurrencyBalance {
  currency: Currency;
  grossIncomeMinor: Minor;
  refundedMinor: Minor;
  netIncomeMinor: Minor;
  incomeTitheMinor: Minor;
  adjustmentTitheMinor: Minor;
  openingMinor: Minor;
  accruedMinor: Minor;
  paidMinor: Minor;
  allocatedMinor: Minor;
  unallocatedMinor: Minor;
  stillToGiveMinor: Minor;
  creditMinor: Minor;
  /** Credit pool before application (unallocated + Σ over-covered). */
  creditPoolMinor: Minor;
  setAsideMinor: Minor;
  stillToSetAsideMinor: Minor;
  /** Ascending year; every year with any event, income, refund or allocation in this currency. */
  buckets: BucketPosition[];
  hasActivity: boolean;
}

/** Raised when a balance invariant fails — always a bug or corrupt input, never a user error. */
export class BalanceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceInvariantError';
  }
}

interface BucketTotals {
  grossIncome: Minor;
  refunded: Minor;
  incomeTithe: Minor;
  adjustmentTithe: Minor;
  opening: Minor;
  allocated: Minor;
}

const emptyTotals = (): BucketTotals => ({
  grossIncome: ZERO,
  refunded: ZERO,
  incomeTithe: ZERO,
  adjustmentTithe: ZERO,
  opening: ZERO,
  allocated: ZERO,
});

function bucketFor(map: Map<number, BucketTotals>, year: number): BucketTotals {
  let totals = map.get(year);
  if (!totals) {
    totals = emptyTotals();
    map.set(year, totals);
  }
  return totals;
}

/** Collects the raw per-year totals of one currency. */
function collectBucketTotals(
  snapshot: LedgerSnapshot,
  events: readonly ObligationEvent[],
  currency: Currency,
): Map<number, BucketTotals> {
  const byYear = new Map<number, BucketTotals>();
  for (const event of events) {
    if (event.currency !== currency) continue;
    const totals = bucketFor(byYear, event.bucketYear);
    if (event.source === 'income') totals.incomeTithe = addMinor(totals.incomeTithe, event.amountMinor);
    else if (event.source === 'refund') totals.adjustmentTithe = addMinor(totals.adjustmentTithe, event.amountMinor);
    else totals.opening = addMinor(totals.opening, event.amountMinor);
  }
  const incomeCurrency = new Map<string, Currency>();
  for (const income of snapshot.incomes) {
    incomeCurrency.set(income.id, income.currency);
    if (income.currency !== currency) continue;
    const totals = bucketFor(byYear, yearOf(income.receivedOn));
    totals.grossIncome = addMinor(totals.grossIncome, income.amountMinor);
  }
  for (const adjustments of adjustmentsByIncome(snapshot).values()) {
    for (const adjustment of adjustments) {
      if (incomeCurrency.get(adjustment.incomeId) !== currency) continue;
      const totals = bucketFor(byYear, yearOf(adjustment.effectiveOn));
      totals.refunded = addMinor(totals.refunded, adjustment.amountMinor);
    }
  }
  for (const payment of snapshot.payments) {
    if (payment.currency !== currency) continue;
    for (const allocation of payment.allocations) {
      const totals = bucketFor(byYear, allocation.bucketYear);
      totals.allocated = addMinor(totals.allocated, allocation.amountMinor);
    }
  }
  return byYear;
}

/** Σ allocations of each payment, checked against the payment amount. */
function unallocatedRemainder(snapshot: LedgerSnapshot, currency: Currency): { paid: Minor; allocated: Minor } {
  let paid = ZERO;
  let allocated = ZERO;
  for (const payment of snapshot.payments) {
    if (payment.currency !== currency) continue;
    const paymentAllocated = sumMinor(payment.allocations.map((a) => a.amountMinor));
    if (paymentAllocated > payment.amountMinor) {
      throw new BalanceInvariantError(`Payment ${payment.id} allocates more than its amount`);
    }
    paid = addMinor(paid, payment.amountMinor);
    allocated = addMinor(allocated, paymentAllocated);
  }
  return { paid, allocated };
}

/** Computes one currency's full balance, applying the credit pool oldest-first. */
function computeCurrencyBalance(
  snapshot: LedgerSnapshot,
  events: readonly ObligationEvent[],
  currency: Currency,
  trackingStart: LocalDate,
): CurrencyBalance {
  const byYear = collectBucketTotals(snapshot, events, currency);
  const { paid, allocated } = unallocatedRemainder(snapshot, currency);
  const unallocated = subMinor(paid, allocated);

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const draft = years.map((year) => {
    const t = byYear.get(year) ?? emptyTotals();
    const accrued = addMinor(t.incomeTithe, t.adjustmentTithe, t.opening);
    const position = subMinor(accrued, t.allocated);
    return { year, totals: t, accrued, position, overCovered: clampZero(subMinor(t.allocated, accrued)) };
  });

  const creditPool = addMinor(unallocated, sumMinor(draft.map((b) => b.overCovered)));
  let remainingPool = creditPool;
  const buckets: BucketPosition[] = draft.map(({ year, totals, accrued, position, overCovered }) => {
    const creditApplied = position > 0 ? minMinor(remainingPool, position) : ZERO;
    remainingPool = subMinor(remainingPool, creditApplied);
    return {
      currency,
      year,
      range: periodRangeForYear(year, trackingStart),
      grossIncomeMinor: totals.grossIncome,
      refundedMinor: totals.refunded,
      netIncomeMinor: subMinor(totals.grossIncome, totals.refunded),
      incomeTitheMinor: totals.incomeTithe,
      adjustmentTitheMinor: totals.adjustmentTithe,
      openingMinor: totals.opening,
      accruedMinor: accrued,
      allocatedMinor: totals.allocated,
      creditAppliedMinor: creditApplied,
      overCoveredMinor: overCovered,
      outstandingMinor: clampZero(subMinor(position, creditApplied)),
    };
  });

  const sum = (pick: (b: BucketPosition) => Minor): Minor => sumMinor(buckets.map(pick));
  const accruedTotal = sum((b) => b.accruedMinor);
  const stillToGive = clampZero(subMinor(accruedTotal, paid));
  const credit = clampZero(subMinor(paid, accruedTotal));

  const outstandingTotal = sum((b) => b.outstandingMinor);
  if (outstandingTotal !== stillToGive) {
    throw new BalanceInvariantError(`${currency}: Σ outstanding ${outstandingTotal} != still to give ${stillToGive}`);
  }
  if (remainingPool !== credit) {
    throw new BalanceInvariantError(`${currency}: remaining credit pool ${remainingPool} != credit ${credit}`);
  }

  const setAside = setAsideBalance(snapshot.setAsides, currency);
  const grossIncome = sum((b) => b.grossIncomeMinor);
  const refunded = sum((b) => b.refundedMinor);
  return {
    currency,
    grossIncomeMinor: grossIncome,
    refundedMinor: refunded,
    netIncomeMinor: subMinor(grossIncome, refunded),
    incomeTitheMinor: sum((b) => b.incomeTitheMinor),
    adjustmentTitheMinor: sum((b) => b.adjustmentTitheMinor),
    openingMinor: sum((b) => b.openingMinor),
    accruedMinor: accruedTotal,
    paidMinor: paid,
    allocatedMinor: allocated,
    unallocatedMinor: unallocated,
    stillToGiveMinor: stillToGive,
    creditMinor: credit,
    creditPoolMinor: creditPool,
    setAsideMinor: setAside,
    stillToSetAsideMinor: stillToSetAside(stillToGive, setAside),
    buckets,
    hasActivity:
      snapshot.incomes.some((r) => r.currency === currency) ||
      snapshot.openings.some((r) => r.currency === currency) ||
      snapshot.payments.some((r) => r.currency === currency) ||
      snapshot.setAsides.some((r) => r.currency === currency),
  };
}

/**
 * Computes every currency's balance from the active records. Each currency is independent.
 * Pass precomputed `events` (from {@link deriveObligationEvents}) to avoid deriving them twice.
 * @throws BalanceInvariantError if Σ outstanding != still to give or remaining pool != credit.
 */
export function computeBalances(
  snapshot: LedgerSnapshot,
  trackingStart: LocalDate,
  events: readonly ObligationEvent[] = deriveObligationEvents(snapshot),
): Record<Currency, CurrencyBalance> {
  const result = {} as Record<Currency, CurrencyBalance>;
  for (const currency of CURRENCIES) {
    result[currency] = computeCurrencyBalance(snapshot, events, currency, trackingStart);
  }
  return result;
}

/** Summary of one period (a single bucket) or of all time, for one currency. */
export interface PeriodSummary {
  currency: Currency;
  range: PeriodRange;
  grossIncomeMinor: Minor;
  refundedMinor: Minor;
  netIncomeMinor: Minor;
  accruedMinor: Minor;
  openingMinor: Minor;
  /** Allocations to the bucket (year), or all payments (all time). */
  givenMinor: Minor;
  creditAppliedMinor: Minor;
  outstandingMinor: Minor;
  /** Number of income entries received in the period. */
  entryCount: number;
}

/**
 * Summarises a period. For a year it reports that bucket (zeros if it has no records) and counts
 * the income entries received that year. For `'all'` it aggregates everything: given = all
 * payments and outstanding = still to give.
 */
export function summarizePeriod(
  balance: CurrencyBalance,
  snapshot: LedgerSnapshot,
  key: PeriodKey,
  trackingStart: LocalDate,
  today: LocalDate,
): PeriodSummary {
  const incomes = snapshot.incomes.filter((r) => r.currency === balance.currency);
  if (key === 'all') {
    return {
      currency: balance.currency,
      range: allTimeRange(trackingStart, today, snapshot),
      grossIncomeMinor: balance.grossIncomeMinor,
      refundedMinor: balance.refundedMinor,
      netIncomeMinor: balance.netIncomeMinor,
      accruedMinor: balance.accruedMinor,
      openingMinor: balance.openingMinor,
      givenMinor: balance.paidMinor,
      creditAppliedMinor: sumMinor(balance.buckets.map((b) => b.creditAppliedMinor)),
      outstandingMinor: balance.stillToGiveMinor,
      entryCount: incomes.length,
    };
  }
  const bucket = balance.buckets.find((b) => b.year === key);
  return {
    currency: balance.currency,
    range: bucket?.range ?? periodRangeForYear(key, trackingStart),
    grossIncomeMinor: bucket?.grossIncomeMinor ?? ZERO,
    refundedMinor: bucket?.refundedMinor ?? ZERO,
    netIncomeMinor: bucket?.netIncomeMinor ?? ZERO,
    accruedMinor: bucket?.accruedMinor ?? ZERO,
    openingMinor: bucket?.openingMinor ?? ZERO,
    givenMinor: bucket?.allocatedMinor ?? ZERO,
    creditAppliedMinor: bucket?.creditAppliedMinor ?? ZERO,
    outstandingMinor: bucket?.outstandingMinor ?? ZERO,
    entryCount: incomes.filter((r) => yearOf(r.receivedOn) === key).length,
  };
}

/** Unpaid balance carried over from earlier years: Σ outstanding of buckets before `currentYear`. */
export function carriedOverMinor(balance: CurrencyBalance, currentYear: number): Minor {
  return sumMinor(balance.buckets.filter((b) => b.year < currentYear).map((b) => b.outstandingMinor));
}

/** Buckets that still have something outstanding, oldest first (the "all outstanding obligations" view). */
export function outstandingBuckets(balance: CurrencyBalance): BucketPosition[] {
  return balance.buckets.filter((b) => b.outstandingMinor > 0);
}

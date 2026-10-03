import "server-only";

import {
  CURRENCIES,
  carriedOverMinor,
  compareStrings,
  computeBalances,
  currentPeriodYear,
  deriveObligationEvents,
  isCurrency,
  type Currency,
  type CurrencyBalance,
  type LedgerRow,
  type LedgerSnapshot,
  type LocalDate,
  type ObligationEvent,
} from "@/domain";
import type { CurrencyHeadlineVM, IncomeRowVM } from "@/lib/view-models";
import type { OwnerTx } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";
import { loadOwnerLedgerTx, type OwnerLedger } from "@/server/services/snapshot";

/** The owner's ledger plus everything derived from it by the domain (events and per-currency balances). */
export interface ComputedLedger extends OwnerLedger {
  events: ObligationEvent[];
  balances: Record<Currency, CurrencyBalance>;
}

/** Loads settings + active snapshot in the caller's owner-scoped transaction and derives balances. */
export async function loadComputedLedgerTx(tx: OwnerTx, ctx: ServiceContext): Promise<ComputedLedger> {
  const ledger = await loadOwnerLedgerTx(tx, ctx);
  const events = deriveObligationEvents(ledger.snapshot);
  const balances = computeBalances(ledger.snapshot, ledger.tracking.trackingStart, events);
  return { ...ledger, events, balances };
}

/** One headline per currency (CURRENCIES order). */
export function headlinesFrom(balances: Record<Currency, CurrencyBalance>, today: LocalDate): CurrencyHeadlineVM[] {
  const year = currentPeriodYear(today);
  return CURRENCIES.map((currency) => {
    const b = balances[currency];
    return {
      currency,
      stillToGiveMinor: b.stillToGiveMinor,
      creditMinor: b.creditMinor,
      accruedMinor: b.accruedMinor,
      paidMinor: b.paidMinor,
      netIncomeMinor: b.netIncomeMinor,
      setAsideMinor: b.setAsideMinor,
      stillToSetAsideMinor: b.stillToSetAsideMinor,
      carriedOverMinor: carriedOverMinor(b, year),
      hasActivity: b.hasActivity,
    };
  });
}

export function incomeRowVM(row: LedgerRow): IncomeRowVM {
  const { income } = row;
  return {
    id: income.id,
    currency: income.currency,
    amountMinor: income.amountMinor,
    receivedOn: income.receivedOn,
    source: income.source,
    category: income.category,
    note: income.note,
    titheMinor: income.titheMinor,
    titheRateBps: income.titheRateBps,
    refundedMinor: row.refundedMinor,
    netAmountMinor: row.netAmountMinor,
    netTitheMinor: row.netTitheMinor,
    refundableMinor: row.refundableMinor,
    version: income.version,
    createdAt: income.createdAt,
    updatedAt: income.updatedAt,
    adjustments: row.adjustments.map((a) => ({
      id: a.id,
      kind: a.kind,
      amountMinor: a.amountMinor,
      effectiveOn: a.effectiveOn,
      reason: a.reason,
      titheDeltaMinor: a.titheDeltaMinor,
      createdAt: a.createdAt,
    })),
  };
}

/** Distinct categories of active income (case-insensitively de-duplicated, sorted) for suggestions. */
export function categoriesOf(snapshot: LedgerSnapshot): string[] {
  const byKey = new Map<string, string>();
  for (const income of snapshot.incomes) {
    if (income.category === null) continue;
    const k = income.category.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, income.category);
  }
  return [...byKey.values()].sort((a, b) => compareStrings(a.toLowerCase(), b.toLowerCase()));
}

/** A currency query parameter, or the fallback when missing/invalid. */
export function currencyParam(value: string | null | undefined, fallback: Currency): Currency {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  return isCurrency(candidate) ? candidate : fallback;
}

export function isEmptySnapshot(snapshot: LedgerSnapshot): boolean {
  return (
    snapshot.incomes.length === 0 &&
    snapshot.adjustments.length === 0 &&
    snapshot.openings.length === 0 &&
    snapshot.payments.length === 0 &&
    snapshot.setAsides.length === 0
  );
}

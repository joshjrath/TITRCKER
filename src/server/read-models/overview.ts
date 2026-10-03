import "server-only";

import {
  ALL_TIME_LABEL,
  availablePeriodYears,
  buildLedgerRows,
  computePayoutStatus,
  cumulativeSeries,
  currentPeriodYear,
  daysBetween,
  monthlyBreakdown,
  periodRange,
  summarizePeriod,
  type LocalDate,
  type PeriodKey,
  type PeriodRange,
} from "@/domain";
import type { OverviewVM, PeriodOptionVM, PeriodProgressVM } from "@/lib/view-models";
import { withOwner } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";

import { categoriesOf, currencyParam, headlinesFrom, incomeRowVM, isEmptySnapshot, loadComputedLedgerTx } from "./common";

export const RECENT_ROWS = 6;
export const ALL_PERIOD_KEY = "all";

export interface OverviewParams {
  /** 'YYYY' (an available period year) or 'all'; anything else falls back to the current year. */
  period?: string | null;
  /** 'CAD' | 'USD'; anything else falls back to the display currency. */
  currency?: string | null;
}

/** Resolves the period query parameter against the available period years. */
export function resolvePeriodKey(param: string | null | undefined, years: readonly number[], today: LocalDate): PeriodKey {
  const value = typeof param === "string" ? param.trim().toLowerCase() : "";
  if (value === ALL_PERIOD_KEY) return "all";
  if (/^\d{4}$/.test(value)) {
    const year = Number(value);
    if (years.includes(year)) return year;
  }
  return currentPeriodYear(today);
}

/** Newest year first, then all time. */
export function periodOptionsFor(years: readonly number[]): PeriodOptionVM[] {
  return [
    ...[...years].sort((a, b) => b - a).map((year) => ({ key: String(year), label: String(year) })),
    { key: ALL_PERIOD_KEY, label: ALL_TIME_LABEL },
  ];
}

/** How far `today` is through the period (0 before it starts, 1 once it has ended). */
export function periodProgressFor(range: PeriodRange, today: LocalDate): PeriodProgressVM {
  const total = daysBetween(range.start, range.end);
  const elapsed = daysBetween(range.start, today);
  const fraction = total <= 0 ? (elapsed >= 0 ? 1 : 0) : Math.min(1, Math.max(0, elapsed / total));
  return { start: range.start, end: range.end, today, fraction };
}

/** The Overview page: headline balances, the selected period and currency, payout status, charts and recent rows. */
export async function getOverview(ctx: ServiceContext, params: OverviewParams = {}): Promise<OverviewVM> {
  const ledger = await withOwner(ctx.ownerId, (tx) => loadComputedLedgerTx(tx, ctx));
  const { snapshot, tracking, today, balances, events, settings } = ledger;

  const currency = currencyParam(params.currency, tracking.displayCurrency);
  const years = availablePeriodYears(tracking.trackingStart, today, snapshot);
  const key = resolvePeriodKey(params.period, years, today);
  const range = periodRange(key, tracking.trackingStart, today, snapshot);
  const balance = balances[currency];

  return {
    today,
    timeZone: tracking.timeZone,
    settings,
    currency,
    headlines: headlinesFrom(balances, today),
    period: range,
    periodOptions: periodOptionsFor(years),
    periodSummary: summarizePeriod(balance, snapshot, key, tracking.trackingStart, today),
    payout: computePayoutStatus({
      today,
      plannedDate: tracking.nextPayoutDate,
      isDefaultDate: tracking.nextPayoutIsDefault,
      balances,
      events,
    }),
    periodProgress: periodProgressFor(range, today),
    chart: cumulativeSeries(snapshot, events, currency, range, today, key),
    monthly: monthlyBreakdown(snapshot, events, currency, range),
    recent: buildLedgerRows(snapshot).slice(0, RECENT_ROWS).map(incomeRowVM),
    buckets: balance.buckets,
    categories: categoriesOf(snapshot),
    isEmpty: isEmptySnapshot(snapshot),
  };
}

/**
 * SAMPLE DATA for the dev-only visualization styleguide. Invented numbers, clearly labelled on the
 * page; never imported by production routes.
 */
import type { CumulativeChartSeries, MonthlyBreakdownRow } from '@/components/charts';

export const firstPeriod = {
  today: '2026-11-18',
  progress: 46 / 89,
  series: {
    currency: 'CAD',
    range: { start: '2026-10-03', end: '2026-12-31', label: 'Oct 3 – Dec 31, 2026' },
    startValueMinor: 0,
    maxMinor: 52_250,
    accrued: [
      { date: '2026-10-03', valueMinor: 0 },
      { date: '2026-10-09', valueMinor: 17_500 },
      { date: '2026-10-23', valueMinor: 29_500 },
      { date: '2026-11-06', valueMinor: 47_000 },
      { date: '2026-11-13', valueMinor: 52_250 },
      { date: '2026-11-18', valueMinor: 52_250 },
    ],
    given: [
      { date: '2026-10-03', valueMinor: 0 },
      { date: '2026-11-01', valueMinor: 20_000 },
      { date: '2026-11-18', valueMinor: 20_000 },
    ],
  } satisfies CumulativeChartSeries,
  monthly: [
    { monthKey: '2026-10', netIncomeMinor: 295_000, titheMinor: 29_500, paidMinor: 0 },
    { monthKey: '2026-11', netIncomeMinor: 227_500, titheMinor: 22_750, paidMinor: 20_000 },
    { monthKey: '2026-12', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
  ] satisfies MonthlyBreakdownRow[],
  stillToGiveMinor: 32_250,
};

function yearSeries(): CumulativeChartSeries {
  const incomes: [string, number][] = [
    ['2027-01-09', 18_250],
    ['2027-01-23', 18_250],
    ['2027-02-06', 18_250],
    ['2027-02-20', 18_250],
    ['2027-02-27', 6_500],
    ['2027-03-06', 18_250],
    ['2027-03-20', 18_250],
    ['2027-04-03', 18_250],
    ['2027-04-17', 18_250],
    ['2027-04-30', -3_000],
    ['2027-05-01', 18_250],
    ['2027-05-15', 18_250],
    ['2027-05-29', 18_250],
    ['2027-06-12', 18_250],
    ['2027-06-26', 18_250],
    ['2027-07-10', 18_250],
    ['2027-07-24', 18_250],
    ['2027-08-07', 18_250],
  ];
  let total = 0;
  const accrued = [{ date: '2027-01-01', valueMinor: 0 }];
  for (const [date, delta] of incomes) {
    total += delta;
    accrued.push({ date, valueMinor: total });
  }
  accrued.push({ date: '2027-08-14', valueMinor: total });
  const given = [
    { date: '2027-01-01', valueMinor: 0 },
    { date: '2027-03-31', valueMinor: 100_000 },
    { date: '2027-06-30', valueMinor: 200_000 },
    { date: '2027-08-14', valueMinor: 200_000 },
  ];
  return {
    currency: 'USD',
    range: { start: '2027-01-01', end: '2027-12-31', label: 'Jan 1 – Dec 31, 2027' },
    startValueMinor: 0,
    maxMinor: total,
    accrued,
    given,
  };
}

export const fullYear = {
  today: '2027-08-14',
  series: yearSeries(),
  monthly: [
    { monthKey: '2027-01', netIncomeMinor: 365_000, titheMinor: 36_500, paidMinor: 0 },
    { monthKey: '2027-02', netIncomeMinor: 430_000, titheMinor: 43_000, paidMinor: 0 },
    { monthKey: '2027-03', netIncomeMinor: 365_000, titheMinor: 36_500, paidMinor: 100_000 },
    { monthKey: '2027-04', netIncomeMinor: 335_000, titheMinor: 33_500, paidMinor: 0 },
    { monthKey: '2027-05', netIncomeMinor: 547_500, titheMinor: 54_750, paidMinor: 0 },
    { monthKey: '2027-06', netIncomeMinor: 365_000, titheMinor: 36_500, paidMinor: 100_000 },
    { monthKey: '2027-07', netIncomeMinor: 365_000, titheMinor: 36_500, paidMinor: 0 },
    { monthKey: '2027-08', netIncomeMinor: 182_500, titheMinor: 18_250, paidMinor: 0 },
    { monthKey: '2027-09', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
    { monthKey: '2027-10', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
    { monthKey: '2027-11', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
    { monthKey: '2027-12', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
  ] satisfies MonthlyBreakdownRow[],
};

export const emptyPeriod = {
  today: '2026-10-03',
  series: {
    currency: 'CAD',
    range: { start: '2026-10-03', end: '2026-12-31', label: 'Oct 3 – Dec 31, 2026' },
    startValueMinor: 0,
    maxMinor: 0,
    accrued: [],
    given: [],
  } satisfies CumulativeChartSeries,
};

export const multiYear: MonthlyBreakdownRow[] = [
  { monthKey: '2026-11', netIncomeMinor: 120_000, titheMinor: 12_000, paidMinor: 0 },
  { monthKey: '2026-12', netIncomeMinor: 80_000, titheMinor: 8_000, paidMinor: 20_000 },
  { monthKey: '2027-01', netIncomeMinor: 15_000, titheMinor: -1_500, paidMinor: 0 },
];

/**
 * View-model types: the exact data contract between the server (read models / actions) and the UI.
 * Money is integer minor units (`Minor`, a branded number); dates are `YYYY-MM-DD` (`LocalDate`, a branded
 * string); timestamps are ISO-8601 strings. Types only — safe to import from client components.
 */
import type {
  AdjustmentKind,
  BucketPosition,
  Currency,
  CumulativeSeries,
  LocalDate,
  Minor,
  MonthRow,
  PayoutStatus,
  PeriodRange,
  PeriodSummary,
  SetAsideKind,
} from "@/domain";

export interface SettingsVM {
  trackingStart: LocalDate;
  timeZone: string;
  displayCurrency: Currency;
  lastEntryCurrency: Currency;
  /** Default church name ('' when not set). */
  churchName: string;
  nextPayoutDate: LocalDate;
  nextPayoutIsDefault: boolean;
  titheRateBps: number;
  roundingPolicy: string;
  version: number;
}

export interface AdjustmentVM {
  id: string;
  kind: AdjustmentKind;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  reason: string;
  /** Derived telescoping tithe change (<= 0). */
  titheDeltaMinor: Minor;
  createdAt: string;
}

export interface IncomeRowVM {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  receivedOn: LocalDate;
  source: string | null;
  category: string | null;
  note: string | null;
  titheMinor: Minor;
  titheRateBps: number;
  refundedMinor: Minor;
  netAmountMinor: Minor;
  netTitheMinor: Minor;
  refundableMinor: Minor;
  version: number;
  createdAt: string;
  updatedAt: string;
  adjustments: AdjustmentVM[];
}

export interface CurrencyHeadlineVM {
  currency: Currency;
  stillToGiveMinor: Minor;
  creditMinor: Minor;
  accruedMinor: Minor;
  paidMinor: Minor;
  netIncomeMinor: Minor;
  setAsideMinor: Minor;
  stillToSetAsideMinor: Minor;
  carriedOverMinor: Minor;
  hasActivity: boolean;
}

/**
 * The combined "Total still to give in CAD" (display-only; ARCHITECTURE §3.10). CAD and USD stay separate everywhere
 * else; only per-currency still-to-give is converted, at the day's published USD→CAD rate.
 */
export interface CombinedTotalVM {
  /** cad_only: nothing owed in USD; combined: USD converted; unavailable: USD owed but no rate could be obtained. */
  status: "cad_only" | "combined" | "unavailable";
  /** CAD still to give plus converted USD still to give (null when unavailable). */
  totalCadMinor: Minor | null;
  cadMinor: Minor;
  usdMinor: Minor;
  usdInCadMinor: Minor | null;
  rate: FxRateVM | null;
}

/** The USD→CAD display rate as the UI shows it (value, source and observation date). */
export interface FxRateVM {
  /** Decimal string such as "1.4145". */
  value: string;
  observedOn: LocalDate;
  sourceLabel: string;
  /** The newest rate is older than expected (providers unreachable); shown as "last available rate". */
  stale: boolean;
}

/** One figure expressed in CAD: the CAD part, the USD part, and the USD part converted (display-only). */
export interface CombinedAmountVM {
  /** CAD part plus the converted USD part. */
  totalCadMinor: Minor;
  cadMinor: Minor;
  usdMinor: Minor;
  usdInCadMinor: Minor;
}

/**
 * The selected period's figures in CAD (display-only; ARCHITECTURE §3.10). Each currency's figures stay available
 * separately in `OverviewVM.periodSummaries`.
 */
export interface CombinedPeriodVM {
  /**
   * single_currency: only the selected currency (or nothing) has activity in the period (shown as they are);
   * combined: the other currency has activity too (or only it does) and any USD could be converted;
   * unavailable: there is USD to convert but no rate.
   */
  status: "single_currency" | "combined" | "unavailable";
  /** Income received (after refunds), in CAD. Null unless combined. */
  incomeCad: CombinedAmountVM | null;
  /** Tithe accrued, in CAD. Null unless combined. */
  accruedCad: CombinedAmountVM | null;
  /** Given in the period, in CAD. Null unless combined. */
  givenCad: CombinedAmountVM | null;
  /** The rate used. Null unless combined with some USD converted (a CAD + USD 0.00 figure needs no rate). */
  rate: FxRateVM | null;
}

export interface PeriodOptionVM {
  /** 'YYYY' or 'all'. */
  key: string;
  label: string;
}

export interface PeriodProgressVM {
  start: LocalDate;
  end: LocalDate;
  today: LocalDate;
  /** 0..1, clamped. */
  fraction: number;
}

export interface OverviewVM {
  today: LocalDate;
  timeZone: string;
  settings: SettingsVM;
  /** Selected currency (query param or display currency). */
  currency: Currency;
  /** Both currencies (the UI shows the selected one prominently, the other compactly if active). */
  headlines: CurrencyHeadlineVM[];
  period: PeriodRange;
  periodOptions: PeriodOptionVM[];
  /** The selected period in the selected currency (drives the chart's currency and the notes). */
  periodSummary: PeriodSummary;
  /** The selected period in each currency. */
  periodSummaries: Record<Currency, PeriodSummary>;
  /** The selected period's bucket per currency (year periods only; null for all time or a year without records). */
  periodBuckets: Record<Currency, BucketPosition | null>;
  /** The selected period's figures combined in CAD when both currencies have activity in it (display-only). */
  combinedPeriod: CombinedPeriodVM;
  payout: PayoutStatus;
  periodProgress: PeriodProgressVM;
  chart: CumulativeSeries;
  monthly: MonthRow[];
  /** Newest 6. */
  recent: IncomeRowVM[];
  /** Selected currency, for the payout review allocation. */
  buckets: BucketPosition[];
  /** Distinct previous categories for suggestions. */
  categories: string[];
  /** No records at all. */
  isEmpty: boolean;
  /** Combined "Total still to give in CAD" (display-only). */
  combined: CombinedTotalVM;
}

/** Defaults for the income entry form, loaded once by the (app) layout. */
export interface EntryDefaultsVM {
  /** Today in the owner's time zone (default and max for the date received). */
  today: LocalDate;
  /** The currency of the last saved entry (CAD for a new account). */
  currency: Currency;
  /** Earliest allowed date received. */
  trackingStart: LocalDate;
  /** Distinct previous categories, for suggestions. */
  categories: string[];
}

export interface LedgerVM {
  today: LocalDate;
  timeZone: string;
  settings: SettingsVM;
  rows: IncomeRowVM[];
  headlines: CurrencyHeadlineVM[];
  categories: string[];
  combined: CombinedTotalVM;
  /**
   * The USD→CAD display rate, present whenever the USD ledger has activity and a rate could be obtained, so the
   * filtered totals can also be shown combined in CAD. Null otherwise.
   */
  displayRate: FxRateVM | null;
}

export interface PaymentAllocationVM {
  bucketYear: number;
  amountMinor: Minor;
}

export interface PaymentVM {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  paidOn: LocalDate;
  churchName: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  version: number;
  allocations: PaymentAllocationVM[];
  unallocatedMinor: Minor;
  reversedAt: string | null;
  reversalReason: string | null;
  linkedSetAsideMinor: Minor;
}

export interface GivenVM {
  today: LocalDate;
  settings: SettingsVM;
  /** Selected currency (query param or display currency). */
  currency: Currency;
  payout: PayoutStatus;
  headlines: CurrencyHeadlineVM[];
  bucketsByCurrency: Record<Currency, BucketPosition[]>;
  /** Newest first, including reversed payments (flagged by reversedAt). */
  payments: PaymentVM[];
  combined: CombinedTotalVM;
}

export interface SetAsideEntryVM {
  id: string;
  currency: Currency;
  kind: SetAsideKind;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  note: string | null;
  paymentId: string | null;
  createdAt: string;
  runningBalanceMinor: Minor;
}

export interface SetAsideCurrencyVM {
  currency: Currency;
  balanceMinor: Minor;
  stillToGiveMinor: Minor;
  stillToSetAsideMinor: Minor;
  history: SetAsideEntryVM[];
}

export interface SetAsideVM {
  today: LocalDate;
  settings: SettingsVM;
  perCurrency: SetAsideCurrencyVM[];
}

export interface OpeningVM {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  label: string;
  note: string | null;
  version: number;
  createdAt: string;
}

export interface SettingsPageVM {
  today: LocalDate;
  settings: SettingsVM;
  openings: OpeningVM[];
  email: string;
  twoFactorEnabled: boolean;
  earliestIncomeDate: LocalDate | null;
  timeZones: string[];
}

// ---------------------------------------------------------------------------------------------
// Action result payloads (data of ActionResult<T>)
// ---------------------------------------------------------------------------------------------

export interface IncomeMutationResult {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  titheMinor: Minor;
  receivedOn: LocalDate;
}

export interface IdResult {
  id: string;
}

export interface AdjustmentMutationResult {
  id: string;
  titheDeltaMinor: Minor;
}

export interface PaymentMutationResult {
  id: string;
  allocations: PaymentAllocationVM[];
  creditMinor: Minor;
}

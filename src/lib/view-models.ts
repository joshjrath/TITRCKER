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
  periodSummary: PeriodSummary;
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
}

export interface LedgerVM {
  today: LocalDate;
  timeZone: string;
  settings: SettingsVM;
  rows: IncomeRowVM[];
  headlines: CurrencyHeadlineVM[];
  categories: string[];
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

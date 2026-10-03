import { CURRENCIES, formatLocalDate, ZERO, type BucketPosition, type Currency, type LocalDate, type Minor } from "@/domain";
import type { GivenVM } from "@/lib/view-models";

/** Everything the payment dialog needs for one currency. */
export interface PaymentCurrencyContext {
  buckets: BucketPosition[];
  stillToGiveMinor: Minor;
  setAsideMinor: Minor;
}

/** Plain, serialisable data the payment dialog is built from (passed from the server page). */
export interface PaymentFormContext {
  today: LocalDate;
  /** Default church name from settings ('' when not set). */
  churchName: string;
  /** The page's selected currency (default for a new payment). */
  defaultCurrency: Currency;
  /** "Dec 31, 2026 · 89 days until payout". */
  payoutSummary: string;
  perCurrency: Record<Currency, PaymentCurrencyContext>;
}

/** Builds the dialog context from the Given read model. */
export function paymentContextFromGiven(vm: GivenVM): PaymentFormContext {
  const perCurrency = Object.fromEntries(
    CURRENCIES.map((currency) => {
      const headline = vm.headlines.find((h) => h.currency === currency);
      const context: PaymentCurrencyContext = {
        buckets: vm.bucketsByCurrency[currency],
        stillToGiveMinor: headline?.stillToGiveMinor ?? ZERO,
        setAsideMinor: headline?.setAsideMinor ?? ZERO,
      };
      return [currency, context];
    }),
  ) as Record<Currency, PaymentCurrencyContext>;
  return {
    today: vm.today,
    churchName: vm.settings.churchName,
    defaultCurrency: vm.currency,
    payoutSummary: `${formatLocalDate(vm.payout.targetDate)} · ${vm.payout.label}`,
    perCurrency,
  };
}

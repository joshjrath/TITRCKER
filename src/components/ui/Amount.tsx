import { splitMinor, toMinor, type Currency } from "@/domain";
import { cn } from "./cn";

export type AmountSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
export type AmountTone = "default" | "muted" | "accent" | "positive" | "copper" | "danger";
export type AmountSign = "auto" | "always" | "never";

export interface AmountProps {
  /** Integer minor units (cents). */
  minor: number;
  currency: Currency;
  size?: AmountSize;
  tone?: AmountTone;
  /** auto: "−" for negatives; always: also "+" for positives; never: absolute value. */
  sign?: AmountSign;
  className?: string;
}

const sizeClasses: Record<AmountSize, { root: string; code: string; cents: string }> = {
  xs: { root: "text-xs", code: "text-[0.95em]", cents: "" },
  sm: { root: "text-label", code: "text-[0.9em]", cents: "" },
  md: { root: "text-[0.9375rem]", code: "text-[0.8em]", cents: "" },
  lg: { root: "text-xl font-normal tracking-[-0.01em]", code: "text-[0.62em] tracking-[0.02em]", cents: "" },
  xl: {
    root: "text-[1.75rem] md:text-[2rem] font-light leading-none tracking-[-0.02em]",
    code: "text-[0.42em] tracking-[0.03em] font-medium",
    cents: "text-[0.62em] text-text-2",
  },
  hero: {
    root: "text-[3.5rem] md:text-[5.5rem] desk:text-[6.5rem] font-light leading-[0.95] tracking-[-0.03em]",
    code: "text-sm md:text-base tracking-[0.04em] font-medium",
    cents: "text-[0.42em] tracking-[-0.01em] text-text-2",
  },
};

const toneClasses: Record<AmountTone, string> = {
  default: "text-text",
  muted: "text-text-2",
  accent: "text-accent",
  positive: "text-positive",
  copper: "text-copper",
  danger: "text-danger",
};

/** The sign character shown visually and the word read aloud. */
export function amountSignParts(minor: number, sign: AmountSign): { glyph: string; spoken: string } {
  if (sign === "never" || minor === 0) return { glyph: "", spoken: "" };
  if (minor < 0) return { glyph: "−", spoken: "minus " };
  if (sign === "always") return { glyph: "+", spoken: "plus " };
  return { glyph: "", spoken: "" };
}

/** Full value as it should be read: "CAD 1,750.00", "minus CAD 25.00". */
export function spokenAmount(minor: number, currency: Currency, sign: AmountSign = "auto"): string {
  const { whole, fraction } = splitMinor(toMinor(minor));
  return `${amountSignParts(minor, sign).spoken}${currency} ${whole}.${fraction}`;
}

/**
 * Money, rendered from integer minor units with the domain's splitMinor (no floats, no Intl currency).
 * The currency code is always visible. Digits are tabular and lining; large sizes use the optical display cut.
 * The visual parts are aria-hidden and a single visually-hidden string carries the full spoken value.
 */
export function Amount({ minor, currency, size = "md", tone = "default", sign = "auto", className }: AmountProps) {
  const parts = splitMinor(toMinor(minor));
  const s = sizeClasses[size];
  const { glyph } = amountSignParts(minor, sign);
  const big = size === "xl" || size === "hero";
  return (
    <span className={cn("tabular inline-flex whitespace-nowrap", toneClasses[tone], s.root, className)} data-amount-minor={minor} data-currency={currency} data-sensitive>
      <span aria-hidden="true" className={cn("inline-flex", big ? "items-baseline gap-[0.18em]" : "items-baseline gap-[0.3em]")}>
        {!big ? <span className={cn("font-medium text-text-2", s.code)}>{currency}</span> : null}
        <span>
          {glyph}
          {parts.whole}
          <span className={s.cents}>.{parts.fraction}</span>
        </span>
        {big ? <span className={cn("ml-[0.35em] self-baseline text-text-2", s.code)}>{currency}</span> : null}
      </span>
      <span className="sr-only">{spokenAmount(minor, currency, sign)}</span>
    </span>
  );
}

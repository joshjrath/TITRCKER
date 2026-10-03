/**
 * Pure helpers for the payment dialog's allocation review. All money math is delegated to the domain
 * (proposeAllocation, validateAllocation, parseAmount); this module only shapes the result for the form.
 */
import {
  AMOUNT_ERROR_MESSAGES,
  clampZero,
  formatLocalDate,
  formatMinor,
  formatMoney,
  parseAmount,
  proposeAllocation,
  subMinor,
  sumMinor,
  validateAllocation,
  ZERO,
  type AllocationLine,
  type BucketPosition,
  type Currency,
  type Minor,
} from "@/domain";

/** The user's own split while "Adjust split" is open: typed amount per bucket year. */
export type SplitDraft = Readonly<Record<number, string>>;

export interface AllocationPreviewLine {
  bucketYear: number;
  /** Period label, e.g. "2026 (Oct 3 – Dec 31)". */
  label: string;
  amountMinor: Minor;
}

export interface AllocationPreview {
  /** Lines with an amount > 0, oldest first. */
  lines: AllocationPreviewLine[];
  /** Payment left unallocated (kept as credit). Zero while the split has errors. */
  creditMinor: Minor;
  /** Σ outstanding of the currency (what is owed right now). */
  totalOutstandingMinor: Minor;
  /** Part of the payment above everything owed (max(0, amount − owed)). */
  excessMinor: Minor;
  /** Form-level problem with the split, or null. */
  error: string | null;
  /** Problems with a single bucket's typed amount, keyed by year. */
  lineErrors: Readonly<Record<number, string>>;
}

/** Buckets that still have something outstanding, oldest first. */
export function openBuckets(buckets: readonly BucketPosition[]): BucketPosition[] {
  return buckets.filter((b) => b.outstandingMinor > 0).sort((a, b) => a.year - b.year);
}

/** Σ outstanding of the given buckets. */
export function totalOutstanding(buckets: readonly BucketPosition[]): Minor {
  return sumMinor(buckets.map((b) => b.outstandingMinor));
}

/** The typed payment amount in minor units, or null when it does not parse. */
export function parsedAmountOrNull(text: string): Minor | null {
  const parsed = parseAmount(text);
  return parsed.ok ? parsed.minor : null;
}

/** Plain decimal for an input value or an action payload: 15000 -> "150.00". */
export function amountText(minor: Minor): string {
  return formatMinor(minor, { grouping: false });
}

/** Short period label used in the allocation review: "2026 (Oct 3 – Dec 31)". */
export function periodShortLabel(bucket: Pick<BucketPosition, "year" | "range">): string {
  return `${bucket.year} (${formatLocalDate(bucket.range.start, "short")} – ${formatLocalDate(bucket.range.end, "short")})`;
}

function labelFor(bucket: BucketPosition | undefined, year: number): string {
  return bucket ? periodShortLabel(bucket) : String(year);
}

/** Parses one typed split amount: blank or zero means "nothing for this period". */
function parseSplitValue(raw: string | undefined): { ok: true; minor: Minor } | { ok: false; message: string } {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, minor: ZERO };
  const parsed = parseAmount(text);
  if (parsed.ok) return { ok: true, minor: parsed.minor };
  if (parsed.error === "zero") return { ok: true, minor: ZERO };
  return { ok: false, message: AMOUNT_ERROR_MESSAGES[parsed.error] };
}

function previewOfLines(
  amountMinor: Minor,
  lines: readonly AllocationLine[],
  open: readonly BucketPosition[],
  creditMinor: Minor,
): Omit<AllocationPreview, "error" | "lineErrors"> {
  const owed = totalOutstanding(open);
  return {
    lines: lines.map((l) => ({
      bucketYear: l.bucketYear,
      label: labelFor(open.find((b) => b.year === l.bucketYear), l.bucketYear),
      amountMinor: l.amountMinor,
    })),
    creditMinor,
    totalOutstandingMinor: owed,
    excessMinor: clampZero(subMinor(amountMinor, owed)),
  };
}

/**
 * What a payment of `amountMinor` covers. Without a split it is the domain's oldest-first proposal; with a
 * split each typed amount is parsed and the whole split is checked with the domain's validateAllocation.
 */
export function previewAllocation(
  amountMinor: Minor,
  currency: Currency,
  buckets: readonly BucketPosition[],
  split: SplitDraft | null,
): AllocationPreview {
  const open = openBuckets(buckets);
  if (split === null) {
    const proposal = proposeAllocation(amountMinor, open);
    return { ...previewOfLines(amountMinor, proposal.allocations, open, proposal.creditMinor), error: null, lineErrors: {} };
  }

  const lineErrors: Record<number, string> = {};
  const lines: AllocationLine[] = [];
  for (const bucket of open) {
    const value = parseSplitValue(split[bucket.year]);
    if (!value.ok) {
      lineErrors[bucket.year] = value.message;
    } else if (value.minor > bucket.outstandingMinor) {
      lineErrors[bucket.year] = `Only ${formatMoney(bucket.outstandingMinor, currency)} is outstanding for ${bucket.year}.`;
    } else if (value.minor > 0) {
      lines.push({ bucketYear: bucket.year, amountMinor: value.minor });
    }
  }
  if (Object.keys(lineErrors).length > 0) {
    return { ...previewOfLines(amountMinor, lines, open, ZERO), error: "Fix the highlighted amounts in the split.", lineErrors };
  }

  const check = validateAllocation(amountMinor, lines, open);
  if (!check.ok) {
    const splitTotal = sumMinor(lines.map((l) => l.amountMinor));
    const error =
      check.error === "exceeds_payment"
        ? `The split adds up to ${formatMoney(splitTotal, currency)}, which is more than the payment of ${formatMoney(amountMinor, currency)}.`
        : "This split can't be used. Use the suggested split or change the amounts.";
    return { ...previewOfLines(amountMinor, lines, open, ZERO), error, lineErrors };
  }
  return { ...previewOfLines(amountMinor, lines, open, check.creditMinor), error: null, lineErrors };
}

/** A split draft prefilled with the given lines; every open bucket gets a value ("0.00" when not covered). */
export function splitDraftFrom(lines: readonly AllocationPreviewLine[], buckets: readonly BucketPosition[]): SplitDraft {
  const draft: Record<number, string> = {};
  for (const bucket of openBuckets(buckets)) {
    const line = lines.find((l) => l.bucketYear === bucket.year);
    draft[bucket.year] = amountText(line?.amountMinor ?? ZERO);
  }
  return draft;
}

/** The recordPaymentAction `allocations` payload for reviewed lines. */
export function allocationInputs(lines: readonly AllocationPreviewLine[]): { bucketYear: number; amount: string }[] {
  return lines.map((l) => ({ bucketYear: l.bucketYear, amount: amountText(l.amountMinor) }));
}

/** Explains a credit remainder in words (null when there is none). */
export function creditExplanation(preview: AllocationPreview, currency: Currency): string | null {
  if (preview.creditMinor <= 0) return null;
  const credit = formatMoney(preview.creditMinor, currency);
  if (preview.creditMinor === preview.excessMinor) {
    return `This is ${credit} more than you owe. The extra is kept as credit and applied to future tithe in ${currency}.`;
  }
  return `${credit} of this payment isn't assigned to a period. It's kept as credit and applied to tithe you owe in ${currency}, oldest first.`;
}

/**
 * Maps the server's allocation field errors back to bucket years, using the lines that were submitted
 * ("allocations.0.amount" -> the first submitted line's year).
 */
export function allocationErrorsByYear(
  fieldErrors: Readonly<Record<string, string>>,
  submitted: readonly { bucketYear: number }[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    const match = /^allocations\.(\d+)\./.exec(key);
    if (!match) continue;
    const line = submitted[Number(match[1])];
    if (line && !(line.bucketYear in out)) out[line.bucketYear] = message;
  }
  return out;
}

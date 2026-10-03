import { addMinor, BPS_DENOMINATOR, computeTithe, formatMoney, toMinor, type Currency, type Minor } from "@/domain";
import { Badge } from "@/components/ui";

const PERCENT = 100;

/** Worked examples, computed by the domain rather than typed out, so they always match the real rule. */
const SALARY = toMinor(175_000);
const ODD = toMinor(24_999);
const EXAMPLES = [SALARY, ODD, toMinor(5), toMinor(1)];

export interface TitheRateInfoProps {
  titheRateBps: number;
  currency: Currency;
}

/** The fixed 10% rate and the per-entry rounding policy in plain words. Read-only. */
export function TitheRateInfo({ titheRateBps, currency }: TitheRateInfoProps) {
  const percent = `${(titheRateBps / BPS_DENOMINATOR) * PERCENT}%`;
  const tithe = (amount: Minor) => computeTithe(amount, titheRateBps);
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <p className="tabular text-[2.5rem] font-light leading-none tracking-[-0.03em] text-text">{percent}</p>
        <Badge tone="neutral">Fixed</Badge>
      </div>
      <p className="text-[0.9375rem] text-text-2">
        Each entry&apos;s tithe is rounded to the nearest cent, half up:{" "}
        <span className="tabular whitespace-nowrap text-text">
          {formatMoney(ODD, currency)} → {formatMoney(tithe(ODD), currency)}
        </span>
        . Totals are sums of those rounded amounts, never {percent} of a total.
      </p>
      <table className="w-full max-w-sm text-[0.875rem]">
        <caption className="sr-only">Examples of the tithe on single entries</caption>
        <thead>
          <tr className="text-right text-label text-text-3">
            <th scope="col" className="pb-2 font-normal">
              Received
            </th>
            <th scope="col" className="pb-2 font-normal">
              Tithe
            </th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line border-y border-line">
          {EXAMPLES.map((amount) => (
            <tr key={amount}>
              <td className="py-2 text-right text-text-2">{formatMoney(amount, currency)}</td>
              <td className="py-2 text-right text-text">{formatMoney(tithe(amount), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-label text-text-3">
        So {formatMoney(SALARY, currency)} and {formatMoney(ODD, currency)} received add{" "}
        {formatMoney(addMinor(tithe(SALARY), tithe(ODD)), currency)} to what you give. An entry too small to round up to a cent is still
        kept in your record.
      </p>
    </div>
  );
}

import { computeTithe, formatMoney, toMinor } from "@/domain";
import { AddIncomeButton } from "@/components/app/AddIncomeButton";

/** Illustrative only: shown as an example of how the 10% works, never as a record. */
const EXAMPLE_MINOR = toMinor(175_000);

/** New-account hero: a calm invitation instead of a balance, with a clearly labelled example. */
export function EmptyInvitation() {
  return (
    <div className="flex h-full flex-col">
      {/* Desktop: sits under the faint orbit, where the balance will appear. */}
      <div className="desk:flex desk:flex-1 desk:flex-col desk:justify-center desk:pb-10 desk:pt-28">
        <h2 className="text-[0.9375rem] font-medium text-text-2">Still to give</h2>
        <p className="mt-3 max-w-[30rem] text-[1.625rem] font-light leading-snug tracking-[-0.02em] text-text md:mt-4 md:text-[2rem]">
          Every payment counts. Add the first money you received and Tenth sets aside 10% in your record.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
          <AddIncomeButton size="lg" className="w-full sm:w-auto" />
          <p className="text-label text-text-2">
            <span className="eyebrow mr-2 text-text-3">Example</span>
            <span className="tabular">
              {formatMoney(EXAMPLE_MINOR, "CAD")} <span aria-hidden="true">→</span>
              <span className="sr-only"> gives </span> {formatMoney(computeTithe(EXAMPLE_MINOR), "CAD")} tithe
            </span>
          </p>
        </div>
      </div>
      <p className="mt-8 border-t border-line pt-5 text-label text-text-3 desk:mt-0">
        Nothing recorded yet. Your income, tithe and payments will appear here.
      </p>
    </div>
  );
}

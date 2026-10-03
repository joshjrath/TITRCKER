import { yearOf } from "@/domain";
import { OrbitalArc, type OrbitGeometry } from "@/components/charts";
import type { OverviewVM } from "@/lib/view-models";
import { BalanceHero } from "./BalanceHero";
import { EmptyInvitation } from "./EmptyInvitation";
import { payoutWindow } from "./overview-text";
import { QuickEntryPanel } from "./QuickEntryPanel";
import { YearEndBlock } from "./YearEndBlock";

/**
 * Desktop orbit (box = first grid row): rises from the left above the hero (which sits lower on desktop to make room),
 * crests in the top padding, clears the payout date and descends along the right edge onto the timeline's cap.
 */
const DESK_ORBIT: Partial<OrbitGeometry> = { cx: 50, cy: 100, rx: 50, ry: 108, startDeg: 206.5, endDeg: 360 };

/**
 * The connected surface at the top of the Overview: hero (left 7/12 on desktop, spanning both rows), year-end
 * block and quick entry (right 5/12). The orbit lives in a grid cell covering the first row only, so it sweeps
 * from behind the hero toward the year-end block whatever the quick entry's height.
 * Phones: hero (with its full-width Add income button), then next payout; quick entry is the add sheet instead.
 */
export function BalanceSurface({ vm }: { vm: OverviewVM }) {
  const headline = vm.headlines.find((h) => h.currency === vm.currency);
  const other = vm.headlines.find((h) => h.currency !== vm.currency && h.hasActivity) ?? null;
  const periodKey = String(vm.period.key);
  const payoutRange = payoutWindow(vm.payout.targetDate, vm.settings.trackingStart, vm.today);
  const periodBucket = typeof vm.period.key === "number" ? vm.buckets.find((b) => b.year === vm.period.key) : undefined;

  return (
    <section aria-label="Balance and next payout" className="noise hero-glow relative overflow-hidden rounded-panel-lg border border-line bg-surface">
      <div className="grid gap-x-6 gap-y-8 p-5 pt-16 md:grid-cols-2 md:p-8 md:pt-20 desk:grid-cols-12 desk:gap-x-12 desk:p-10">
        <div aria-hidden="true" className="pointer-events-none relative [grid-area:1/1/2/-1]">
          {/* Desktop: the box ends exactly on the period timeline's payout cap (8px in, 32px up from the row end). */}
          <div className="absolute inset-0 desk:bottom-8 desk:right-2">
            <OrbitalArc
              progress={payoutRange.fraction}
              variant={vm.isEmpty ? "empty" : "active"}
              geometry={DESK_ORBIT}
              className="[--orbit-band-top:-3.5rem] md:[--orbit-band-top:-4rem]"
            />
          </div>
        </div>
        <div className="relative [grid-area:1/1/2/-1] desk:[grid-area:1/1/3/8]">
          {vm.isEmpty || !headline ? (
            <EmptyInvitation />
          ) : (
            <BalanceHero
              headline={headline}
              other={other}
              summary={vm.periodSummary}
              periodBucket={periodBucket}
              buckets={vm.buckets}
              currentYear={yearOf(vm.today)}
              periodKey={periodKey}
            />
          )}
        </div>
        <div className="relative desk:[grid-area:1/8/2/13]">
          <YearEndBlock payout={vm.payout} currency={vm.currency} progress={payoutRange} />
        </div>
        <QuickEntryPanel className="relative hidden md:block desk:[grid-area:2/8/3/13]" />
      </div>
    </section>
  );
}

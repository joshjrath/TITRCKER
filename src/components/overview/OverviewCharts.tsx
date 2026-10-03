import { formatLocalDate, type CumulativeSeries, type MonthRow } from "@/domain";
import { CumulativeChart, MonthlyBreakdown } from "@/components/charts";
import { cn } from "@/components/ui";
import { monthlyGivenNote } from "./overview-text";

export interface OverviewChartsProps {
  chart: CumulativeSeries;
  monthly: readonly MonthRow[];
  today: string;
  payoutDate: string;
  className?: string;
}

const panel = "min-w-0 rounded-panel border border-line bg-surface p-5 md:p-6";

/** Cumulative accrued tithe (wide) beside the monthly breakdown (narrow), both for the selected period/currency. */
export function OverviewCharts({ chart, monthly, today, payoutDate, className }: OverviewChartsProps) {
  const payoutLabel = payoutDate === chart.range.end ? `Payout ${formatLocalDate(chart.range.end, "short")}` : undefined;
  return (
    <div className={cn("grid gap-4 desk:grid-cols-12", className)}>
      <div className={cn(panel, "desk:col-span-7")}>
        <CumulativeChart
          series={chart}
          today={today}
          title="Accrued tithe"
          payoutLabel={payoutLabel}
          emptyMessage="Your accrued tithe builds here as you add income."
        />
      </div>
      <div className={cn(panel, "desk:col-span-5")}>
        <MonthlyBreakdown
          rows={monthly}
          currency={chart.currency}
          rangeLabel={chart.range.label}
          emptyMessage="No income in this period yet."
          note={monthlyGivenNote(chart.range.key)}
        />
      </div>
    </div>
  );
}

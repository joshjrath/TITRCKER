import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface PageHeaderProps {
  title: ReactNode;
  /** Tiny overline above the title. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** e.g. a period <Select>. */
  periodSlot?: ReactNode;
  /** e.g. <CurrencyToggle>. */
  currencySlot?: ReactNode;
  /** Primary action, e.g. "Add income". Full width on phones. */
  actionSlot?: ReactNode;
  titleId?: string;
  className?: string;
}

/** Page title row. Controls sit to the right on tablet/desktop and wrap under the title on phones. */
export function PageHeader({ title, eyebrow, description, periodSlot, currencySlot, actionSlot, titleId, className }: PageHeaderProps) {
  const hasControls = Boolean(periodSlot || currencySlot || actionSlot);
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 id={titleId} className="text-[1.625rem] font-medium leading-tight tracking-[-0.025em] text-text md:text-[1.875rem]">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-prose text-[0.9375rem] text-text-2">{description}</p> : null}
      </div>
      {hasControls ? (
        <div className="flex flex-wrap items-end gap-2 md:shrink-0 md:flex-nowrap md:gap-3">
          {periodSlot ? <div className="min-w-0 flex-1 md:flex-none">{periodSlot}</div> : null}
          {currencySlot ? <div className="shrink-0">{currencySlot}</div> : null}
          {actionSlot ? <div className="w-full md:w-auto [&>*]:w-full md:[&>*]:w-auto">{actionSlot}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

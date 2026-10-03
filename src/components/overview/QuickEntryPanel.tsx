"use client";

import { useIncomeEntry } from "@/components/app/IncomeEntryProvider";
import { IncomeForm } from "@/components/income/IncomeForm";
import { cn } from "@/components/ui";

/** Raised quick-entry container (tablet/desktop): the compact income form, always ready for the next entry. */
export function QuickEntryPanel({ className }: { className?: string }) {
  const { defaults, reportSaved } = useIncomeEntry();
  return (
    <section
      aria-labelledby="quick-entry-heading"
      className={cn("rounded-panel border border-line-strong bg-bg/55 p-5 md:p-6", className)}
    >
      <h2 id="quick-entry-heading" className="mb-4 text-[0.9375rem] font-medium text-text">
        Add income
      </h2>
      <IncomeForm compact mode="create" defaults={defaults} onSaved={(result) => reportSaved(result, "create")} />
    </section>
  );
}

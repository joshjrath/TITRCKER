"use client";

import { Download, FileJson, FileSpreadsheet, ListFilter } from "lucide-react";
import type { ReactNode } from "react";
import { Button, buttonClasses, cn } from "@/components/ui";
import { entryCountText } from "./ledger-view";

export interface LedgerExportsProps {
  /** Rows in the current view (0 disables the filtered export). */
  shownCount: number;
  filtered: boolean;
  onExportFiltered: () => void;
  className?: string;
}

function ExportItem({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 desk:py-0 desk:pl-6 desk:first:pl-0">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-text-3 [&_svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-medium text-text">{title}</h3>
          <p className="mt-0.5 text-label text-text-2">{children}</p>
        </div>
      </div>
      <div className="pl-7">{action}</div>
    </li>
  );
}

/** Downloads: the full reconciliation CSV, the filtered view as CSV (made in the browser) and the JSON backup. */
export function LedgerExports({ shownCount, filtered, onExportFiltered, className }: LedgerExportsProps) {
  const download = <Download aria-hidden="true" className="size-4" />;
  return (
    <section aria-labelledby="ledger-exports" className={cn("rounded-panel border border-line px-5 py-5 md:px-6", className)}>
      <h2 id="ledger-exports" className="text-[0.9375rem] font-medium text-text">
        Export and backup
      </h2>
      <p className="mt-1 text-label text-text-3">Files are made from your records when you click. Nothing is sent anywhere else.</p>
      <ul className="mt-5 flex flex-col divide-y divide-line desk:grid desk:grid-cols-3 desk:divide-x desk:divide-y-0">
        <ExportItem
          icon={<FileSpreadsheet />}
          title="Full ledger (CSV)"
          action={
            <a href="/api/export/csv" download className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {download}
              Export CSV
            </a>
          }
        >
          Every income entry, refund, payment, opening balance and set-aside record in both currencies, with reconciliation
          totals. Opens in any spreadsheet app.
        </ExportItem>
        <ExportItem
          icon={<ListFilter />}
          title="This view (CSV)"
          action={
            <Button variant="secondary" size="sm" leadingIcon={download} onClick={onExportFiltered} disabled={shownCount === 0}>
              Export filtered view
            </Button>
          }
        >
          {shownCount === 0
            ? "No entries are shown, so there is nothing to export."
            : `Only the ${entryCountText(shownCount)} ${filtered ? "matching your filters" : "listed above"}, in the current order, with a total per currency.`}
        </ExportItem>
        <ExportItem
          icon={<FileJson />}
          title="Backup (JSON)"
          action={
            <a href="/api/export/backup" download className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {download}
              Download backup (JSON)
            </a>
          }
        >
          A complete copy of all your records and settings, including deleted and reversed items and the change history, for safekeeping.
        </ExportItem>
      </ul>
    </section>
  );
}

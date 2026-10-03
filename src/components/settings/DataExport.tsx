import { FileJson, FileSpreadsheet } from "lucide-react";

import { buttonClasses } from "@/components/ui";

const EXPORTS = [
  {
    href: "/api/export/csv",
    label: "Export CSV",
    Icon: FileSpreadsheet,
    title: "Spreadsheet (CSV)",
    body: "Every income entry, refund, opening balance, church payment and Set aside entry, with balances per currency. Opens in Excel, Numbers or Google Sheets.",
  },
  {
    href: "/api/export/backup",
    label: "Download backup",
    Icon: FileJson,
    title: "Full backup (JSON)",
    body: "Your complete history, including deleted and reversed records and the audit trail, in one file you can keep.",
  },
] as const;

/** Export links. Both are plain GET downloads of the signed-in owner's data; nothing is sent anywhere else. */
export function DataExport() {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {EXPORTS.map(({ href, label, Icon, title, body }) => (
          <li key={href} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 gap-3">
              <Icon aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-text">{title}</p>
                <p className="text-[0.875rem] text-text-2">{body}</p>
              </div>
            </div>
            <a href={href} download className={buttonClasses({ variant: "secondary", className: "shrink-0 self-start sm:self-center" })}>
              {label}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-label text-text-3">
        Files download to this device only when you ask. Tenth never emails backups or sends your data anywhere. Every amount
        carries its own currency; files never convert between CAD and USD.
      </p>
    </div>
  );
}

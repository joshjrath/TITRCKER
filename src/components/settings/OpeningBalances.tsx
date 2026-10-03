"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { CURRENCIES, formatLocalDate, formatMoney, sumMinor, type Currency, type LocalDate } from "@/domain";
import { Amount, Button, IconButton } from "@/components/ui";
import type { OpeningVM } from "@/lib/view-models";

import { DeleteOpeningDialog } from "./DeleteOpeningDialog";
import { OpeningDialog } from "./OpeningDialog";

export interface OpeningBalancesProps {
  openings: readonly OpeningVM[];
  today: LocalDate;
  defaultCurrency: Currency;
}

type DialogState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; opening: OpeningVM }
  | { kind: "delete"; opening: OpeningVM };

/** Active opening balances with add / edit / remove. Totals are shown per currency, never combined. */
export function OpeningBalances({ openings, today, defaultCurrency }: OpeningBalancesProps) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // A new session number per opening gives every dialog a fresh form (and idempotency key).
  const [session, setSession] = useState(0);
  const show = (next: DialogState) => {
    setSession((s) => s + 1);
    setDialog(next);
  };
  const close = () => setDialog({ kind: "none" });

  const sorted = [...openings].sort((a, b) => (a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : 0));
  const totals = CURRENCIES.map((currency) => {
    const rows = openings.filter((o) => o.currency === currency);
    return { currency, count: rows.length, total: sumMinor(rows.map((o) => o.amountMinor)) };
  }).filter((t) => t.count > 1);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {sorted.length === 0 ? (
        <p className="rounded-control border border-dashed border-line-strong px-4 py-4 text-[0.875rem] text-text-2">
          No opening balances. Add one if you already owed tithe when you started using Tenth.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {sorted.map((opening) => {
            const name = `${opening.label}, ${formatMoney(opening.amountMinor, opening.currency)}`;
            return (
              <li key={opening.id} className="flex items-start justify-between gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[0.9375rem] font-medium text-text">{opening.label}</p>
                  <p className="tabular text-label text-text-3">Owed as of {formatLocalDate(opening.effectiveOn)}</p>
                  {opening.note ? <p className="mt-1 line-clamp-2 break-words text-label text-text-2">{opening.note}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Amount minor={opening.amountMinor} currency={opening.currency} size="md" />
                  <div className="-mr-2 flex">
                    <IconButton size="sm" icon={<Pencil />} aria-label={`Edit opening balance: ${name}`} onClick={() => show({ kind: "edit", opening })} />
                    <IconButton
                      size="sm"
                      icon={<Trash2 />}
                      aria-label={`Remove opening balance: ${name}`}
                      onClick={() => show({ kind: "delete", opening })}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totals.length > 0 ? (
        <p className="tabular text-label text-text-2">
          {totals.map((t, i) => (
            <span key={t.currency}>
              {i > 0 ? " · " : ""}
              Total:{" "}
              <span className="text-text" data-sensitive>
                {formatMoney(t.total, t.currency)}
              </span>
            </span>
          ))}
        </p>
      ) : null}

      <div>
        <Button variant="secondary" leadingIcon={<Plus aria-hidden="true" className="size-4" />} onClick={() => show({ kind: "add" })}>
          Add opening balance
        </Button>
      </div>

      <OpeningDialog
        key={`form-${session}`}
        open={dialog.kind === "add" || dialog.kind === "edit"}
        onClose={close}
        opening={dialog.kind === "edit" ? dialog.opening : undefined}
        today={today}
        defaultCurrency={defaultCurrency}
      />
      {dialog.kind === "delete" ? (
        <DeleteOpeningDialog key={`delete-${session}`} opening={dialog.opening} open onClose={close} />
      ) : null}
    </div>
  );
}

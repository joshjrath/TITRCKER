"use client";

import { IncomeEditDialog } from "@/components/income";
import type { IncomeRowVM } from "@/lib/view-models";
import { DeleteAdjustmentDialog } from "./DeleteAdjustmentDialog";
import { DeleteIncomeDialog } from "./DeleteIncomeDialog";
import { RefundDialog } from "./RefundDialog";

export type LedgerDialogKind = "edit" | "refund" | "delete" | "adjustment";

/** Which dialog is open and for what. `session` changes on every opening so each opening starts a fresh form. */
export interface LedgerDialogState {
  kind: LedgerDialogKind | null;
  rowId: string | null;
  adjustmentId: string | null;
  session: number;
}

export const CLOSED_DIALOG: LedgerDialogState = { kind: null, rowId: null, adjustmentId: null, session: 0 };

export interface LedgerDialogsProps {
  state: LedgerDialogState;
  /** All current rows (the dialog always works on the freshest version of its entry). */
  rows: readonly IncomeRowVM[];
  today: string;
  onClose: () => void;
  /** A refund was added or removed on this row. */
  onAdjusted: (row: IncomeRowVM, label: string) => void;
  onDeleted: (row: IncomeRowVM) => void;
}

/**
 * Hosts the row dialogs. A closed dialog stays mounted (open=false) while its entry exists, so focus returns to the
 * row's menu button; it unmounts only when the entry itself is gone.
 */
export function LedgerDialogs({ state, rows, today, onClose, onAdjusted, onDeleted }: LedgerDialogsProps) {
  const row = state.rowId ? rows.find((r) => r.id === state.rowId) : undefined;
  const adjustment = row && state.adjustmentId ? row.adjustments.find((a) => a.id === state.adjustmentId) : undefined;
  const key = `${state.rowId}:${state.session}`;
  return (
    <>
      <IncomeEditDialog income={state.kind === "edit" && row ? row : null} onClose={onClose} />
      {row ? (
        <>
          <RefundDialog
            key={`refund-${key}`}
            row={row}
            open={state.kind === "refund"}
            today={today}
            onClose={onClose}
            onSaved={(r) => onAdjusted(r, "Refund saved")}
          />
          <DeleteIncomeDialog key={`delete-${key}`} row={row} open={state.kind === "delete"} onClose={onClose} onDeleted={onDeleted} />
        </>
      ) : null}
      {row && adjustment ? (
        <DeleteAdjustmentDialog
          key={`adj-${key}-${adjustment.id}`}
          row={row}
          adjustment={adjustment}
          open={state.kind === "adjustment"}
          onClose={onClose}
          onRemoved={(r) => onAdjusted(r, "Refund removed")}
        />
      ) : null}
    </>
  );
}

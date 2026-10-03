import type { IncomeRowVM } from "@/lib/view-models";

/** What a row's action menu (and its refund list) can ask the ledger to open. */
export interface LedgerRowActions {
  edit: (row: IncomeRowVM) => void;
  refund: (row: IncomeRowVM) => void;
  remove: (row: IncomeRowVM) => void;
  removeAdjustment: (row: IncomeRowVM, adjustmentId: string) => void;
}

/** A row's "just changed" emphasis: the wash/outline class plus the text badge that says why. */
export interface RowHighlight {
  className: string;
  label: string;
}

export type HighlightFor = (rowId: string) => RowHighlight | null;

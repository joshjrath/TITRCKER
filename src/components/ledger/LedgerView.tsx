"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSavedIncomeHighlight } from "@/components/app/IncomeEntryProvider";
import { useHighlight } from "@/components/motion";
import type { LedgerVM } from "@/lib/view-models";
import { downloadTextFile } from "./download";
import { LedgerDialogs, CLOSED_DIALOG, type LedgerDialogKind, type LedgerDialogState } from "./LedgerDialogs";
import { LedgerEmpty } from "./LedgerEmpty";
import { LedgerEntries } from "./LedgerEntries";
import { LedgerExports } from "./LedgerExports";
import { AllTimeBalance } from "./LedgerSummary";
import {
  DEFAULT_LEDGER_VIEW,
  filteredCsv,
  filteredCsvFilename,
  hasActiveFilters,
  selectRows,
  selectionTotals,
  type LedgerViewState,
} from "./ledger-view";
import type { HighlightFor, LedgerRowActions } from "./row-types";
import { useDeleteUndo } from "./use-delete-undo";

interface Flash {
  id: string;
  token: number;
  label: string;
}

/**
 * The income ledger: all-time balance, filters (kept in the browser only), filtered totals, the entries
 * (table from 768px, rows on phones), row dialogs and exports.
 */
export function LedgerView({ vm }: { vm: LedgerVM }) {
  const [view, setView] = useState<LedgerViewState>(DEFAULT_LEDGER_VIEW);
  const deferredView = useDeferredValue(view);
  const [dialog, setDialog] = useState<LedgerDialogState>(CLOSED_DIALOG);
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashToken = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recoverFocus = useRef(false);

  const selection = useMemo(() => selectRows(vm.rows, deferredView), [vm.rows, deferredView]);
  const totals = useMemo(() => selectionTotals(selection.ledgerRows), [selection.ledgerRows]);
  const filtered = hasActiveFilters(deferredView);

  // Highlights: saves from the shared income form (add sheet, edit dialog) and this page's own changes.
  const savedClass = useSavedIncomeHighlight();
  const flashClass = useHighlight(flash?.id ?? null, flash?.token);
  const highlightFor = useCallback<HighlightFor>(
    (id) => {
      const saved = savedClass(id);
      if (saved) return { className: saved, label: "Saved" };
      const local = flashClass(id);
      return local && flash ? { className: local, label: flash.label } : null;
    },
    [savedClass, flashClass, flash],
  );

  const markChanged = useCallback((id: string, label: string) => {
    flashToken.current += 1;
    setFlash({ id, token: flashToken.current, label });
  }, []);

  // When the element that had focus disappears with its entry (delete, refund removed), move focus to the list.
  useEffect(() => {
    if (!recoverFocus.current) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      headingRef.current?.focus();
      recoverFocus.current = false;
    }
  }, [vm.rows]);

  const open = useCallback((kind: LedgerDialogKind, rowId: string, adjustmentId: string | null = null) => {
    setDialog((d) => ({ kind, rowId, adjustmentId, session: d.session + 1 }));
  }, []);

  const actions = useMemo<LedgerRowActions>(
    () => ({
      edit: (row) => open("edit", row.id),
      refund: (row) => open("refund", row.id),
      remove: (row) => open("delete", row.id),
      removeAdjustment: (row, adjustmentId) => open("adjustment", row.id, adjustmentId),
    }),
    [open],
  );

  const offerUndo = useDeleteUndo(useCallback((row) => markChanged(row.id, "Restored"), [markChanged]));

  const patchView = useCallback((patch: Partial<LedgerViewState>) => setView((v) => ({ ...v, ...patch })), []);
  const resetFilters = useCallback(() => setView((v) => ({ ...DEFAULT_LEDGER_VIEW, sort: v.sort })), []);

  const exportFiltered = () => downloadTextFile(filteredCsv(selection.ledgerRows), filteredCsvFilename(vm.today));

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <AllTimeBalance headlines={vm.headlines} />

      {vm.rows.length === 0 ? (
        <section aria-label="Income entries" className="rounded-panel border border-line bg-surface px-5 md:px-8">
          <LedgerEmpty />
        </section>
      ) : (
        <LedgerEntries
          headingRef={headingRef}
          view={view}
          onViewChange={patchView}
          onReset={resetFilters}
          today={vm.today}
          earliest={vm.settings.trackingStart}
          rows={selection.rows}
          totalCount={vm.rows.length}
          totals={totals}
          filtered={filtered}
          actions={actions}
          highlightFor={highlightFor}
        />
      )}

      <LedgerExports shownCount={selection.rows.length} filtered={filtered} onExportFiltered={exportFiltered} />

      <LedgerDialogs
        state={dialog}
        rows={vm.rows}
        today={vm.today}
        onClose={() => setDialog((d) => ({ ...d, kind: null }))}
        onAdjusted={(row, label) => {
          recoverFocus.current = label === "Refund removed";
          markChanged(row.id, label);
        }}
        onDeleted={(row) => {
          recoverFocus.current = true;
          offerUndo(row);
        }}
      />
    </div>
  );
}

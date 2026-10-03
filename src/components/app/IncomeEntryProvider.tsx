"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useHighlight } from "@/components/motion";
import { Button, Sheet, useToast } from "@/components/ui";
import { IncomeForm } from "@/components/income/IncomeForm";
import type { IncomeFormDefaults } from "@/components/income/form-state";
import { incomeSavedMessage } from "@/components/income/messages";
import type { IncomeMutationResult } from "@/lib/view-models";

/** The most recent confirmed income save; `token` changes on every save so the same row can highlight again. */
export interface LastSavedIncome {
  id: string;
  token: number;
}

export interface IncomeEntryContextValue {
  /** Entry form defaults from the (app) layout (today, last currency, tracking start, categories). */
  defaults: IncomeFormDefaults;
  /** Opens the global "Add income" sheet. */
  openAddIncome: () => void;
  lastSaved: LastSavedIncome | null;
  /** Call after a confirmed save from any IncomeForm: shows the toast and marks the row for highlighting. */
  reportSaved: (result: IncomeMutationResult, mode: "create" | "edit") => void;
}

const IncomeEntryContext = createContext<IncomeEntryContextValue | null>(null);

/** Access the shared income entry (add sheet, defaults, last saved row). Must be inside <IncomeEntryProvider>. */
export function useIncomeEntry(): IncomeEntryContextValue {
  const ctx = useContext(IncomeEntryContext);
  if (!ctx) throw new Error("useIncomeEntry() must be used inside <IncomeEntryProvider>");
  return ctx;
}

/** Row class for the newly saved income (lavender wash, static outline under reduced motion), '' for others. */
export function useSavedIncomeHighlight(): (rowId: string) => string {
  const { lastSaved } = useIncomeEntry();
  return useHighlight(lastSaved?.id ?? null, lastSaved?.token);
}

const DISCARD_PROMPT = "Discard this income entry? What you typed will be lost.";

export interface IncomeEntryProviderProps {
  defaults: IncomeFormDefaults;
  children: ReactNode;
}

/**
 * App-level owner of the "Add income" sheet, so the desktop header button, the mobile bottom-nav Add button and
 * empty-state calls to action all open the same form. Also announces confirmed saves (toast with text) and exposes
 * the last saved income id for row highlighting.
 */
export function IncomeEntryProvider({ defaults, children }: IncomeEntryProviderProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const formElementId = useId();
  const [lastSaved, setLastSaved] = useState<LastSavedIncome | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const tokenRef = useRef(0);

  const openAddIncome = useCallback(() => {
    dirtyRef.current = false;
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);

  const onPendingChange = useCallback((pending: boolean) => {
    savingRef.current = pending;
    setSaving(pending);
  }, []);

  const reportSaved = useCallback(
    (result: IncomeMutationResult, mode: "create" | "edit") => {
      tokenRef.current += 1;
      setLastSaved({ id: result.id, token: tokenRef.current });
      toast({ ...incomeSavedMessage(result, mode), variant: "success" });
    },
    [toast],
  );

  const value = useMemo(
    () => ({ defaults, openAddIncome, lastSaved, reportSaved }),
    [defaults, openAddIncome, lastSaved, reportSaved],
  );

  return (
    <IncomeEntryContext.Provider value={value}>
      {children}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        // Stay open while a save is in flight; the result (toast or error) belongs to this form.
        onRequestClose={() => !savingRef.current && (!dirtyRef.current || window.confirm(DISCARD_PROMPT))}
        title="Add income"
        description="Enter money you received. Tenth adds 10% to what you still have to give."
        phoneAction={
          <Button type="submit" form={formElementId} size="sm" loading={saving} loadingLabel="Saving…">
            Save
          </Button>
        }
      >
        <IncomeForm
          key={formKey}
          id={formElementId}
          mode="create"
          defaults={defaults}
          onPendingChange={onPendingChange}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onSaved={(result) => {
            dirtyRef.current = false;
            setOpen(false);
            reportSaved(result, "create");
          }}
        />
      </Sheet>
    </IncomeEntryContext.Provider>
  );
}

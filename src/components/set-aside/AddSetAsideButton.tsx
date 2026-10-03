"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { Currency, LocalDate, Minor } from "@/domain";
import { Button, type ButtonProps } from "@/components/ui";

import { SetAsideEntryDialog } from "./SetAsideEntryDialog";

export interface AddSetAsideButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  today: LocalDate;
  defaultCurrency: Currency;
  balances: Record<Currency, Minor>;
  label?: string;
}

/** "Add entry" button that opens a fresh Set aside entry dialog each time. */
export function AddSetAsideButton({ today, defaultCurrency, balances, label = "Add entry", ...buttonProps }: AddSetAsideButtonProps) {
  const [state, setState] = useState({ open: false, session: 0 });
  return (
    <>
      <Button
        leadingIcon={<Plus aria-hidden="true" className="size-4" />}
        {...buttonProps}
        onClick={() => setState((s) => ({ open: true, session: s.session + 1 }))}
      >
        {label}
      </Button>
      <SetAsideEntryDialog
        key={state.session}
        open={state.open}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        today={today}
        defaultCurrency={defaultCurrency}
        balances={balances}
      />
    </>
  );
}

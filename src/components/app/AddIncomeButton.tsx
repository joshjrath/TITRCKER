"use client";

import { Plus } from "lucide-react";
import { AddActionButton } from "@/components/shell";
import { Button, type ButtonProps } from "@/components/ui";
import { useIncomeEntry } from "./IncomeEntryProvider";

export type AddIncomeButtonProps = Omit<ButtonProps, "onClick" | "type" | "children"> & { label?: string };

/** Primary "Add income" button that opens the shared add-income sheet. */
export function AddIncomeButton({ label = "Add income", leadingIcon, ...rest }: AddIncomeButtonProps) {
  const { openAddIncome } = useIncomeEntry();
  return (
    <Button {...rest} leadingIcon={leadingIcon ?? <Plus aria-hidden="true" className="size-4" strokeWidth={2.25} />} onClick={openAddIncome}>
      {label}
    </Button>
  );
}

/** The centered mobile bottom-nav "Add" control (AppShell `addAction`), opening the same sheet. */
export function AddIncomeNavAction() {
  const { openAddIncome } = useIncomeEntry();
  return <AddActionButton label="Add" aria-label="Add income" onClick={openAddIncome} />;
}

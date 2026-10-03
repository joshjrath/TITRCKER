"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { HandCoins } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui";

import type { PaymentFormContext } from "./payment-context";
import { PaymentDialog, type PaymentDialogMode } from "./PaymentDialog";

interface LauncherValue {
  openRecord: () => void;
  openPayout: () => void;
  /** Id of the payment recorded most recently in this page session (for the row highlight). */
  lastRecordedId: string | null;
}

const LauncherContext = createContext<LauncherValue | null>(null);

function useLauncher(): LauncherValue {
  const value = useContext(LauncherContext);
  if (!value) throw new Error("Payment buttons must be rendered inside <PaymentLauncher>");
  return value;
}

/** The last recorded payment id, or null outside a launcher. */
export function useLastRecordedPaymentId(): string | null {
  return useContext(LauncherContext)?.lastRecordedId ?? null;
}

export interface PaymentLauncherProps {
  context: PaymentFormContext;
  /** Open the payout review on load (from `?review=payout`). */
  openPayoutOnLoad?: boolean;
  children: ReactNode;
}

/**
 * Hosts the single payment dialog for the Given page and lets any button inside open it in "record" or
 * "payout" mode. Each opening is a fresh form instance (new idempotency key, fresh values).
 */
export function PaymentLauncher({ context, openPayoutOnLoad = false, children }: PaymentLauncherProps) {
  const router = useRouter();
  const [state, setState] = useState<{ open: boolean; mode: PaymentDialogMode; session: number }>({
    open: openPayoutOnLoad,
    mode: "payout",
    session: 0,
  });
  const [lastRecordedId, setLastRecordedId] = useState<string | null>(null);

  const openWith = useCallback((mode: PaymentDialogMode) => {
    setState((s) => ({ open: true, mode, session: s.session + 1 }));
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    const url = new URL(window.location.href);
    if (url.searchParams.has("review")) {
      url.searchParams.delete("review");
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
  }, [router]);

  const value = useMemo<LauncherValue>(
    () => ({ openRecord: () => openWith("record"), openPayout: () => openWith("payout"), lastRecordedId }),
    [openWith, lastRecordedId],
  );

  return (
    <LauncherContext.Provider value={value}>
      {children}
      <PaymentDialog
        key={state.session}
        open={state.open}
        mode={state.mode}
        context={context}
        onClose={close}
        onRecorded={setLastRecordedId}
      />
    </LauncherContext.Provider>
  );
}

type LaunchButtonProps = Omit<ButtonProps, "onClick" | "children">;

/** Primary "Record a payment" action. */
export function RecordPaymentButton(props: LaunchButtonProps) {
  const { openRecord } = useLauncher();
  return (
    <Button leadingIcon={<HandCoins aria-hidden="true" className="size-4" />} {...props} onClick={openRecord}>
      Record a payment
    </Button>
  );
}

/** "Review payout": the payment review with the amount still to give prefilled. */
export function ReviewPayoutButton(props: LaunchButtonProps) {
  const { openPayout } = useLauncher();
  return (
    <Button variant="secondary" {...props} onClick={openPayout}>
      Review payout
    </Button>
  );
}

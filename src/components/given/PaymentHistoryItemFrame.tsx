"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/ui";
import { useHighlight } from "@/components/motion";

import { useLastRecordedPaymentId } from "./PaymentLauncher";

/** A payment history <li> that briefly highlights when it is the payment just recorded on this page. */
export function PaymentHistoryItemFrame({ paymentId, className, children }: { paymentId: string; className?: string; children: ReactNode }) {
  const lastId = useLastRecordedPaymentId();
  const highlightClass = useHighlight(lastId);
  return <li className={cn(className, highlightClass(paymentId))}>{children}</li>;
}

"use client";

import { useState } from "react";
import { PencilLine, Undo2 } from "lucide-react";

import { formatLocalDate, formatMoney } from "@/domain";
import { Menu } from "@/components/ui";
import type { PaymentVM } from "@/lib/view-models";

import { EditPaymentDialog } from "./EditPaymentDialog";
import { ReversePaymentDialog } from "./ReversePaymentDialog";

type Open = { kind: "edit" | "reverse" | null; session: number };

/** Row menu for an active payment: "Edit details" and "Reverse payment". Each opening is a fresh form. */
export function PaymentRowActions({ payment }: { payment: PaymentVM }) {
  const [open, setOpen] = useState<Open>({ kind: null, session: 0 });
  const show = (kind: "edit" | "reverse") => setOpen((o) => ({ kind, session: o.session + 1 }));
  const close = () => setOpen((o) => ({ ...o, kind: null }));
  const label = `Actions for ${formatMoney(payment.amountMinor, payment.currency)} paid ${formatLocalDate(payment.paidOn)}`;

  return (
    <>
      <Menu
        label={label}
        items={[
          { id: "edit", label: "Edit details", icon: <PencilLine />, onSelect: () => show("edit") },
          "separator",
          { id: "reverse", label: "Reverse payment", icon: <Undo2 />, danger: true, onSelect: () => show("reverse") },
        ]}
      />
      <EditPaymentDialog key={`edit-${open.session}`} payment={payment} open={open.kind === "edit"} onClose={close} />
      <ReversePaymentDialog key={`rev-${open.session}`} payment={payment} open={open.kind === "reverse"} onClose={close} />
    </>
  );
}

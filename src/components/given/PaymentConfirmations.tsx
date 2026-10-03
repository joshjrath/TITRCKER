"use client";

import { formatMoney, type Currency, type Minor } from "@/domain";
import { Checkbox, InlineAlert } from "@/components/ui";

export interface PaymentConfirmationsProps {
  currency: Currency;
  /** Explanation of the credit remainder, or null when the payment creates no credit. */
  creditMessage: string | null;
  confirmCredit: boolean;
  onConfirmCredit: (value: boolean) => void;
  /** Current Set aside balance in this currency; the option only shows when it is > 0. */
  setAsideMinor: Minor;
  drawFromSetAside: boolean;
  onDrawFromSetAside: (value: boolean) => void;
  churchName: string;
  confirmMade: boolean;
  onConfirmMade: (value: boolean) => void;
  errors: Readonly<Record<string, string>>;
  disabled?: boolean;
}

/** Credit warning + confirmation, the optional Set aside release and the required "I made this payment". */
export function PaymentConfirmations({
  currency,
  creditMessage,
  confirmCredit,
  onConfirmCredit,
  setAsideMinor,
  drawFromSetAside,
  onDrawFromSetAside,
  churchName,
  confirmMade,
  onConfirmMade,
  errors,
  disabled,
}: PaymentConfirmationsProps) {
  const church = churchName.trim() || "your church";
  return (
    <div className="flex flex-col gap-1">
      {creditMessage ? (
        <div className="mb-2 flex flex-col gap-1">
          <InlineAlert tone="warning" live="status" title="More than you owe">
            {creditMessage}
          </InlineAlert>
          <Checkbox
            label="Keep the extra as credit"
            checked={confirmCredit}
            disabled={disabled}
            onChange={(e) => onConfirmCredit(e.target.checked)}
            error={errors.confirmCredit}
          />
        </div>
      ) : null}
      {setAsideMinor > 0 ? (
        <Checkbox
          label={`Also take this out of Set aside (balance ${formatMoney(setAsideMinor, currency)})`}
          hint="Records a release of up to the payment amount, linked to this payment. Optional."
          checked={drawFromSetAside}
          disabled={disabled}
          onChange={(e) => onDrawFromSetAside(e.target.checked)}
          error={errors.drawFromSetAside}
        />
      ) : null}
      <Checkbox
        label={`I made this payment to ${church} outside Tenth`}
        hint="Tenth only keeps a record. It never sends money."
        checked={confirmMade}
        disabled={disabled}
        onChange={(e) => onConfirmMade(e.target.checked)}
        error={errors.confirmMadePayment}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";

import { Badge, Button } from "@/components/ui";

import { DisableTwoFactorDialog, RegenerateCodesDialog } from "./TwoFactorManageDialogs";
import { TwoFactorSetupDialog } from "./TwoFactorSetupDialog";

export interface TwoFactorPanelProps {
  enabled: boolean;
  account: string;
  today: string;
}

type Open = "none" | "setup" | "disable" | "regenerate";

/**
 * Two-factor status and actions. The dialogs stay mounted across the status change, so the setup dialog can show
 * its final step after the page refreshes with two-factor on.
 */
export function TwoFactorPanel({ enabled, account, today }: TwoFactorPanelProps) {
  const [open, setOpen] = useState<Open>("none");
  const [session, setSession] = useState(0);
  const show = (next: Open) => {
    setSession((s) => s + 1);
    setOpen(next);
  };
  const close = () => setOpen("none");
  const Icon = enabled ? ShieldCheck : ShieldOff;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <h3 className="text-[0.9375rem] font-medium text-text">Two-factor authentication</h3>
        <Badge tone={enabled ? "positive" : "neutral"}>
          <Icon aria-hidden="true" className="size-3.5" />
          {enabled ? "On" : "Off"}
        </Badge>
      </div>
      <p className="text-[0.875rem] text-text-2">
        After your password, Tenth also asks for a 6-digit code from an authenticator app on your phone, so a stolen password
        alone can&apos;t open your record.
      </p>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button variant="secondary" onClick={() => show("regenerate")}>
              New backup codes
            </Button>
            <Button variant="ghost" onClick={() => show("disable")} className="text-danger! hover:text-danger-hover!">
              Turn off
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => show("setup")}>
            Set up two-factor
          </Button>
        )}
      </div>

      <TwoFactorSetupDialog key={`setup-${session}`} open={open === "setup"} onClose={close} account={account} today={today} />
      <DisableTwoFactorDialog key={`disable-${session}`} open={open === "disable"} onClose={close} />
      <RegenerateCodesDialog key={`regen-${session}`} open={open === "regenerate"} onClose={close} account={account} today={today} />
    </div>
  );
}

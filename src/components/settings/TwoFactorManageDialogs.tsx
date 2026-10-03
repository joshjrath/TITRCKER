"use client";

import { useId, useState } from "react";

import { Button, Dialog, useToast } from "@/components/ui";
import { disableTwoFactor, regenerateBackupCodes } from "@/server/actions/two-factor";

import { BackupCodesPanel } from "./BackupCodesPanel";
import { PasswordConfirmFields } from "./PasswordConfirmFields";
import { usePasswordStep } from "./use-password-step";

interface ManageDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Turns two-factor off after the password is confirmed. */
export function DisableTwoFactorDialog({ open, onClose }: ManageDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const step = usePasswordStep(disableTwoFactor);

  const submit = () =>
    step.submit(() => {
      toast({ title: "Two-factor authentication is off", description: "Sign-in now needs only your password." });
      onClose();
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={() => !step.pending}
      size="sm"
      title="Turn off two-factor authentication?"
      description="Signing in will need only your password. Your backup codes stop working."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={step.pending}>
            Keep it on
          </Button>
          <Button variant="danger" type="submit" form={formId} loading={step.pending} loadingLabel="Turning off…">
            Turn off
          </Button>
        </>
      }
    >
      <PasswordConfirmFields
        formId={formId}
        password={step.password}
        onPasswordChange={step.setPassword}
        onSubmit={submit}
        pending={step.pending}
        fieldError={step.fieldError}
        formError={step.formError}
      />
    </Dialog>
  );
}

/** Replaces every backup code after the password is confirmed, then shows the new codes once. */
export function RegenerateCodesDialog({ open, onClose, account, today }: ManageDialogProps & { account: string; today: string }) {
  const formId = useId();
  const { toast } = useToast();
  const step = usePasswordStep(regenerateBackupCodes);
  const [codes, setCodes] = useState<string[] | null>(null);
  const guard = () =>
    !step.pending && (codes === null || window.confirm("Close? Make sure you've saved the new codes — they won't be shown again."));

  const submit = () =>
    step.submit((data) => {
      setCodes(data.backupCodes);
      toast({ title: "New backup codes created", description: "Your old codes no longer work." });
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title={codes ? "Your new backup codes" : "Create new backup codes?"}
      description={codes ? undefined : "Your current backup codes stop working as soon as the new ones are created."}
      footer={
        codes ? (
          <Button onClick={() => guard() && onClose()}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={step.pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={step.pending} loadingLabel="Creating…">
              Create new codes
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <BackupCodesPanel codes={codes} account={account} createdOn={today} />
      ) : (
        <PasswordConfirmFields
          formId={formId}
          password={step.password}
          onPasswordChange={step.setPassword}
          onSubmit={submit}
          pending={step.pending}
          fieldError={step.fieldError}
          formError={step.formError}
        />
      )}
    </Dialog>
  );
}

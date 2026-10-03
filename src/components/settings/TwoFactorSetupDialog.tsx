"use client";

import { useId, useState } from "react";

import { Button, Checkbox, Dialog, InlineAlert, useToast } from "@/components/ui";
import { startTwoFactorEnrollment, type TwoFactorEnrollment } from "@/server/actions/two-factor";

import { BackupCodesPanel } from "./BackupCodesPanel";
import { PasswordConfirmFields } from "./PasswordConfirmFields";
import { ScanStep, useVerifyCode, VerifyStep } from "./TwoFactorSteps";
import { usePasswordStep } from "./use-password-step";

export interface TwoFactorSetupDialogProps {
  open: boolean;
  onClose: () => void;
  account: string;
  today: string;
}

type Step = "password" | "scan" | "codes" | "verify" | "done";

const STEP_TITLES: Record<Exclude<Step, "done">, string> = {
  password: "Confirm your password",
  scan: "Scan the QR code",
  codes: "Save your backup codes",
  verify: "Enter a code to finish",
};
const STEP_ORDER = ["password", "scan", "codes", "verify"] as const;
const ABANDON_MESSAGE = "Stop setting up two-factor authentication? It stays off until you finish.";

/**
 * Two-factor enrollment in four steps: confirm password -> scan the QR (or type the key) -> save backup codes ->
 * enter a 6-digit code. Two-factor is only switched on by the last step; closing earlier leaves it off.
 */
export function TwoFactorSetupDialog({ open, onClose, account, today }: TwoFactorSetupDialogProps) {
  const formId = useId();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("password");
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const passwordStep = usePasswordStep(startTwoFactorEnrollment);
  const [codesSaved, setCodesSaved] = useState(false);

  const inProgress = step === "scan" || step === "codes" || step === "verify";
  const stepIndex = step === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(step) + 1;

  const begin = () =>
    passwordStep.submit((data) => {
      setEnrollment(data);
      setStep("scan");
    });

  const verify = useVerifyCode(() => {
    setStep("done");
    toast({ title: "Two-factor authentication is on", description: "Tenth will ask for a code when you sign in." });
  });
  const pending = passwordStep.pending || verify.pending;
  const guard = () => !pending && (!inProgress || window.confirm(ABANDON_MESSAGE));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={guard}
      title={step === "done" ? "Two-factor authentication is on" : "Set up two-factor authentication"}
      description={step === "done" ? undefined : `Step ${stepIndex} of ${STEP_ORDER.length} · ${STEP_TITLES[step]}`}
      footer={
        <SetupFooter
          step={step}
          formId={formId}
          pending={pending}
          codesSaved={codesSaved}
          onCancel={() => guard() && onClose()}
          onBack={() => setStep(step === "verify" ? "codes" : "scan")}
          onNext={() => setStep(step === "scan" ? "codes" : "verify")}
          onDone={onClose}
        />
      }
    >
      {step === "password" ? (
        <PasswordConfirmFields
          formId={formId}
          password={passwordStep.password}
          onPasswordChange={passwordStep.setPassword}
          onSubmit={begin}
          pending={passwordStep.pending}
          fieldError={passwordStep.fieldError}
          formError={passwordStep.formError}
          hint="Two-factor stays off until you finish the last step."
        />
      ) : null}
      {step === "scan" && enrollment ? <ScanStep enrollment={enrollment} /> : null}
      {step === "codes" && enrollment ? (
        <div className="flex flex-col gap-4">
          <BackupCodesPanel codes={enrollment.backupCodes} account={account} createdOn={today} />
          <Checkbox label="I've saved my backup codes" checked={codesSaved} onChange={(e) => setCodesSaved(e.target.checked)} />
        </div>
      ) : null}
      {step === "verify" ? <VerifyStep formId={formId} state={verify} /> : null}
      {step === "done" ? (
        <div className="flex flex-col gap-3 text-[0.9375rem] text-text-2">
          <InlineAlert tone="success">Two-factor authentication is on.</InlineAlert>
          <p>Next time you sign in, Tenth asks for a code from your authenticator app after your password. Lost your phone? Use one of your backup codes.</p>
        </div>
      ) : null}
    </Dialog>
  );
}

function SetupFooter(props: {
  step: Step;
  formId: string;
  pending: boolean;
  codesSaved: boolean;
  onCancel: () => void;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const { step, formId, pending } = props;
  if (step === "done") return <Button onClick={props.onDone}>Done</Button>;
  const secondary =
    step === "codes" || step === "verify" ? (
      <Button variant="ghost" onClick={props.onBack} disabled={pending}>
        Back
      </Button>
    ) : (
      <Button variant="ghost" onClick={props.onCancel} disabled={pending}>
        Cancel
      </Button>
    );
  const primary =
    step === "password" ? (
      <Button type="submit" form={formId} loading={pending} loadingLabel="Checking…">
        Continue
      </Button>
    ) : step === "verify" ? (
      <Button type="submit" form={formId} loading={pending} loadingLabel="Checking…">
        Turn on two-factor
      </Button>
    ) : (
      <Button onClick={props.onNext} disabled={step === "codes" && !props.codesSaved}>
        Continue
      </Button>
    );
  return (
    <>
      {secondary}
      {primary}
    </>
  );
}

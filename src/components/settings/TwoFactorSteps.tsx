"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";

import { Button, Field, InlineAlert, TextInput, useToast } from "@/components/ui";
import { confirmTwoFactor, type TwoFactorEnrollment } from "@/server/actions/two-factor";

import { copyText } from "./BackupCodesPanel";
import { groupSecret, parseTotpUri } from "./totp";

/** Step 2 of the two-factor setup: the QR code, or the setup key for typing by hand. */
export function ScanStep({ enrollment }: { enrollment: TwoFactorEnrollment }) {
  const { announce } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const { secret } = parseTotpUri(enrollment.totpUri);

  const copySecret = async () => {
    if (!secret) return;
    const message = (await copyText(secret)) ? "Setup key copied." : "Couldn't copy. Select the key and copy it yourself.";
    setCopied(message);
    announce(message);
  };

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0 self-center rounded-[12px] bg-white p-2.5 sm:self-start">
        {/* Plain <img>: next/image emits a style attribute that the CSP blocks. The data: URI is allowed by img-src. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrollment.qrSvgDataUri}
          alt="QR code that adds Tenth to your authenticator app"
          width={168}
          height={168}
          className="block size-[168px]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 text-[0.9375rem] text-text-2">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>Open an authenticator app on your phone, such as 1Password, Google Authenticator or Authy.</li>
          <li>Add a new account and scan this QR code.</li>
        </ol>
        {secret ? (
          <div className="flex flex-col gap-2">
            <p className="text-label text-text-2">Can&apos;t scan it? Type this setup key instead:</p>
            <code className="select-all break-words rounded-control border border-line bg-bg/60 px-3 py-2 font-mono text-[0.9375rem] tracking-[0.06em] text-text">
              {groupSecret(secret)}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" leadingIcon={<Copy aria-hidden="true" className="size-4" />} onClick={() => void copySecret()}>
                Copy key
              </Button>
              {copied ? <span className="text-label text-text-2">{copied}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** State for the "enter a 6-digit code" step; `onVerified` runs once two-factor is switched on. */
export function useVerifyCode(onVerified: () => void) {
  const [code, setCodeState] = useState("");
  const [error, setError] = useState<{ field?: string; form?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setCode = (value: string) => {
    setCodeState(value);
    setError(null);
  };

  const submit = () => {
    if (pending) return;
    const digits = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(digits)) {
      setError({ field: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    startTransition(async () => {
      const result = await confirmTwoFactor({ code: digits });
      if (!result.ok) {
        const field = result.fieldErrors?.code;
        setError(field ? { field } : { form: result.message });
        return;
      }
      onVerified();
    });
  };

  return { code, setCode, pending, fieldError: error?.field, formError: error?.form ?? null, submit };
}

export interface VerifyStepProps {
  formId: string;
  state: ReturnType<typeof useVerifyCode>;
}

/** Step 4 of the two-factor setup: confirm the app works by entering its current code. */
export function VerifyStep({ formId, state }: VerifyStepProps) {
  return (
    <form
      id={formId}
      noValidate
      aria-busy={state.pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        state.submit();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="6-digit code" required error={state.fieldError} hint="The code your authenticator app shows for Tenth. It changes every 30 seconds.">
        <TextInput
          data-autofocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          value={state.code}
          disabled={state.pending}
          onChange={(e) => state.setCode(e.target.value)}
          className="tabular max-w-[12rem] text-lg tracking-[0.2em]"
        />
      </Field>
      {state.formError ? (
        <InlineAlert tone="danger" live="alert">
          {state.formError}
        </InlineAlert>
      ) : null}
    </form>
  );
}

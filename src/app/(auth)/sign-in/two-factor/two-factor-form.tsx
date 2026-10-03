"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, retryAfterFrom } from "@/lib/auth-client";
import { TRUST_DEVICE_DAYS } from "@/server/auth/policy";

import { Button, Checkbox, Field, InlineAlert, TextInput } from "@/components/ui";

type Mode = "totp" | "backup";

interface FormError {
  message: string;
  /** The challenge is gone: the visitor must start again from the password step. */
  restart: boolean;
}

function describeError(status: number, code: string | undefined, mode: Mode, retryAfter: number | null): FormError {
  if (status === 429) {
    const wait = retryAfter ? `${retryAfter} second${retryAfter === 1 ? "" : "s"}` : "a few minutes";
    return { message: `Too many attempts. Try again in ${wait}.`, restart: false };
  }
  switch (code) {
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return {
        message: mode === "totp" ? "That code is not correct. Check your authenticator app and try again." : "That backup code is not valid.",
        restart: false,
      };
    case "INVALID_TWO_FACTOR_COOKIE":
      return { message: "This sign-in attempt has expired.", restart: true };
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return { message: "Too many incorrect codes for this sign-in attempt.", restart: true };
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return { message: "Too many failed verification attempts. Your account is locked for a few minutes.", restart: false };
    default:
      return { message: "The code could not be verified. Try again.", restart: false };
  }
}

export function TwoFactorForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("totp");
  const [error, setError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").replace(/\s+/g, "");
    const trustDevice = form.get("trustDevice") === "on";
    if (mode === "totp" && !/^\d{6}$/.test(code)) {
      setError({ message: "Enter the 6-digit code from your authenticator app.", restart: false });
      return;
    }
    if (code.length === 0) {
      setError({ message: "Enter one of your backup codes.", restart: false });
      return;
    }
    setError(null);
    setPending(true);
    let retryAfter: number | null = null;
    const fetchOptions = { onError: (ctx: { response: Response }) => void (retryAfter = retryAfterFrom(ctx.response)) };
    try {
      const { error: authError } =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code, trustDevice }, fetchOptions)
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice }, fetchOptions);
      if (authError) {
        setError(describeError(authError.status, authError.code, mode, retryAfter));
        setPending(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError({ message: "Verification is unavailable right now. Check your connection and try again.", restart: false });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      {error ? (
        <InlineAlert tone="danger" live="alert">
          {error.message}{" "}
          {error.restart ? (
            <Link href="/sign-in" className="font-medium text-text underline underline-offset-4">
              Sign in again
            </Link>
          ) : null}
        </InlineAlert>
      ) : null}

      {mode === "totp" ? (
        <Field key="totp" label="Authentication code" required hint="The 6-digit code from your authenticator app.">
          <TextInput
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            autoFocus
            className="tabular text-lg tracking-[0.2em]"
          />
        </Field>
      ) : (
        <Field key="backup" label="Backup code" required hint="Each backup code works once.">
          <TextInput name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} autoFocus className="font-mono" />
        </Field>
      )}

      <Checkbox name="trustDevice" label={`Trust this device for ${TRUST_DEVICE_DAYS} days`} hint="Skip the code on this browser. Only on a device you own." />

      <Button type="submit" size="lg" fullWidth loading={pending} loadingLabel="Verifying…">
        Verify
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setError(null);
        }}
        className="min-h-11 self-center rounded-[8px] px-2 text-label font-medium text-accent underline-offset-4 hover:underline"
      >
        {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app instead"}
      </button>
    </form>
  );
}

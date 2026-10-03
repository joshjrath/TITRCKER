"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, retryAfterFrom } from "@/lib/auth-client";
import { TRUST_DEVICE_DAYS } from "@/server/auth/policy";

import { FormAlert, SubmitButton, TextField } from "../../_components/auth-ui";

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
        <FormAlert>
          {error.message}{" "}
          {error.restart ? (
            <Link href="/sign-in" className="font-medium underline underline-offset-4">
              Sign in again
            </Link>
          ) : null}
        </FormAlert>
      ) : null}

      {mode === "totp" ? (
        <TextField
          key="totp"
          label="Authentication code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          hint="The 6-digit code from your authenticator app."
        />
      ) : (
        <TextField
          key="backup"
          label="Backup code"
          name="code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          required
          autoFocus
          hint="Each backup code works once."
        />
      )}

      <label className="flex items-center gap-2.5 text-body text-text-2">
        <input type="checkbox" name="trustDevice" className="size-4 accent-accent" />
        Trust this device for {TRUST_DEVICE_DAYS} days
      </label>

      <SubmitButton pending={pending} pendingLabel="Verifying…">
        Verify
      </SubmitButton>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setError(null);
        }}
        className="self-start text-label font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {mode === "totp" ? "Use a backup code instead" : "Use your authenticator app instead"}
      </button>
    </form>
  );
}

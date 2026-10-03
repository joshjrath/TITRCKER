"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, retryAfterFrom, TWO_FACTOR_PATH } from "@/lib/auth-client";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/policy";

import { FormAlert, SubmitButton, TextField } from "../_components/auth-ui";

const GENERIC_ERROR = "Email or password is incorrect.";

function rateLimitMessage(retryAfter: number | null): string {
  return retryAfter
    ? `Too many sign-in attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`
    : "Too many sign-in attempts. Try again in a minute.";
}

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setPending(true);

    let retryAfter: number | null = null;
    try {
      const { data, error: authError } = await authClient.signIn.email(
        { email, password },
        { onError: (ctx) => void (retryAfter = retryAfterFrom(ctx.response)) },
      );
      if (authError) {
        setError(authError.status === 429 ? rateLimitMessage(retryAfter) : authError.status >= 500 ? "Sign-in is unavailable right now. Try again." : GENERIC_ERROR);
        setPending(false);
        return;
      }
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        // Password accepted; the second factor is still required.
        router.push(TWO_FACTOR_PATH);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign-in is unavailable right now. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      <FormAlert>{error}</FormAlert>
      <TextField label="Email" name="email" type="email" autoComplete="username" required autoFocus spellCheck={false} />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
      />
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

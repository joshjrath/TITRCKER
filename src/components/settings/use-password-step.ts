"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

interface StepError {
  field?: string;
  form?: string;
}

/**
 * State for a "confirm your password" step that calls a password-confirmed Server Action. The password is cleared
 * as soon as the action succeeds; on failure it is kept and the error is shown on the field or the form.
 */
export function usePasswordStep<T>(action: (input: { password: string }) => Promise<ActionResult<T>>) {
  const [password, setPasswordState] = useState("");
  const [error, setError] = useState<StepError | null>(null);
  const [pending, startTransition] = useTransition();

  const setPassword = (value: string) => {
    setPasswordState(value);
    setError(null);
  };

  const submit = (onSuccess: (data: T) => void) => {
    if (pending) return;
    if (password === "") {
      setError({ field: "Enter your password." });
      return;
    }
    startTransition(async () => {
      const result = await action({ password });
      if (!result.ok) {
        const field = result.fieldErrors?.password;
        setError(field ? { field } : { form: result.message });
        return;
      }
      setPasswordState("");
      setError(null);
      onSuccess(result.data);
    });
  };

  return { password, setPassword, pending, fieldError: error?.field, formError: error?.form ?? null, submit };
}

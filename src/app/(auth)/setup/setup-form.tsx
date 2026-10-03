"use client";

import { useState, useTransition, type FormEvent } from "react";

import { setupOwnerAction } from "@/server/actions/auth";
import { OWNER_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/server/auth/policy";

import { FormAlert, SubmitButton, TextField } from "../_components/auth-ui";

type FieldName = "token" | "email" | "name" | "password" | "confirmPassword";

export function SetupForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const value = (name: FieldName) => String(form.get(name) ?? "");
    const input = {
      token: value("token"),
      email: value("email"),
      name: value("name"),
      password: value("password"),
      confirmPassword: value("confirmPassword"),
    };
    if (input.password !== input.confirmPassword) {
      setMessage(null);
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }
    setMessage(null);
    setFieldErrors({});
    startTransition(async () => {
      // On success the action redirects to /sign-in, so a returned value is always a failure.
      const result = await setupOwnerAction(input);
      if (!result.ok) {
        setMessage(result.message);
        setFieldErrors((result.fieldErrors ?? {}) as Partial<Record<FieldName, string>>);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      <FormAlert>{message}</FormAlert>
      <TextField
        label="Setup token"
        name="token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        required
        error={fieldErrors.token}
      />
      <TextField
        label="Owner email"
        name="email"
        type="email"
        autoComplete="username"
        spellCheck={false}
        required
        error={fieldErrors.email}
        hint="Must match the OWNER_EMAIL configured for this deployment."
      />
      <TextField label="Your name" name="name" autoComplete="name" required maxLength={OWNER_NAME_MAX_LENGTH} error={fieldErrors.name} />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        error={fieldErrors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A passphrase of several words works well.`}
      />
      <TextField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
        error={fieldErrors.confirmPassword}
      />
      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create owner account
      </SubmitButton>
    </form>
  );
}

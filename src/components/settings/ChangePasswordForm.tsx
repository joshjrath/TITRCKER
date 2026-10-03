"use client";

import { useRef, useState, useTransition } from "react";

import { useUnsavedChangesGuard, type FormFailure } from "@/components/given/form-session";
import { Button, Checkbox, Field, InlineAlert, TextInput, useToast } from "@/components/ui";
import { changePasswordAction } from "@/server/actions/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/server/auth/policy";
import { changePasswordSchema, fieldErrorsFrom } from "@/server/auth/schemas";

interface Draft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  revokeOtherSessions: boolean;
}

const EMPTY: Draft = { currentPassword: "", newPassword: "", confirmPassword: "", revokeOtherSessions: true };

/** Change the owner's password after re-entering the current one; optionally signs out every other device. */
export function ChangePasswordForm({ email }: { email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const dirty = draft.currentPassword !== "" || draft.newPassword !== "" || draft.confirmPassword !== "";
  useUnsavedChangesGuard(dirty, pending);
  const errors = failure?.fieldErrors ?? {};

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (failure) setFailure(null);
  };

  const fail = (next: FormFailure) => {
    setFailure(next);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const submit = () => {
    if (pending) return;
    const { confirmPassword, ...input } = draft;
    const parsed = changePasswordSchema.safeParse(input);
    const clientErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
    if (!clientErrors.newPassword && confirmPassword !== draft.newPassword) clientErrors.confirmPassword = "The passwords don't match.";
    if (Object.keys(clientErrors).length > 0) {
      fail({ message: "Please check the highlighted fields.", fieldErrors: clientErrors });
      return;
    }
    startTransition(async () => {
      const result = await changePasswordAction(input);
      if (!result.ok) {
        fail({ message: result.message, fieldErrors: result.fieldErrors ?? {} });
        return;
      }
      setDraft(EMPTY);
      toast({ title: "Password changed", description: result.data.otherSessionsRevoked ? "Other devices were signed out." : undefined });
    });
  };

  return (
    <form
      ref={formRef}
      noValidate
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-md flex-col gap-4"
    >
      <h3 className="text-[0.9375rem] font-medium text-text">Change password</h3>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} hidden readOnly />
      <Field label="Current password" required error={errors.currentPassword}>
        <TextInput
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={draft.currentPassword}
          disabled={pending}
          onChange={(e) => change({ currentPassword: e.target.value })}
        />
      </Field>
      <Field
        label="New password"
        required
        error={errors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A passphrase of several words works well.`}
      >
        <TextInput
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={draft.newPassword}
          disabled={pending}
          onChange={(e) => change({ newPassword: e.target.value })}
        />
      </Field>
      <Field label="Confirm new password" required error={errors.confirmPassword}>
        <TextInput
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={draft.confirmPassword}
          disabled={pending}
          onChange={(e) => change({ confirmPassword: e.target.value })}
        />
      </Field>
      <Checkbox
        label="Sign out other devices"
        hint="Recommended if someone else might know your current password. This device stays signed in."
        checked={draft.revokeOtherSessions}
        disabled={pending}
        onChange={(e) => change({ revokeOtherSessions: e.target.checked })}
      />
      {failure && !Object.values(failure.fieldErrors).includes(failure.message) ? (
        <InlineAlert tone="danger" live="alert">
          {failure.message}
        </InlineAlert>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel="Changing password…">
          Change password
        </Button>
      </div>
    </form>
  );
}

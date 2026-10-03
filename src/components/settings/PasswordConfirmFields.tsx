"use client";

import { Field, InlineAlert, TextInput } from "@/components/ui";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/policy";

export interface PasswordConfirmFieldsProps {
  formId: string;
  password: string;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  pending: boolean;
  /** Message for the password field (e.g. "Password is incorrect."). */
  fieldError?: string;
  /** Form-level message (rate limit, server error). */
  formError?: string | null;
  hint?: string;
}

/** "Confirm your password" step shared by the two-factor dialogs. Submit with a footer button `form={formId}`. */
export function PasswordConfirmFields({
  formId,
  password,
  onPasswordChange,
  onSubmit,
  pending,
  fieldError,
  formError,
  hint = "For your security, confirm it's you.",
}: PasswordConfirmFieldsProps) {
  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Password" required error={fieldError} hint={hint}>
        <TextInput
          data-autofocus
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          disabled={pending}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </Field>
      {formError ? (
        <InlineAlert tone="danger" live="alert">
          {formError}
        </InlineAlert>
      ) : null}
    </form>
  );
}

/**
 * Zod schemas for auth inputs (owner bootstrap, password change, two-factor). Pure: safe to import from client
 * components for early feedback; the server always re-validates.
 */
import { z } from "zod";

import { OWNER_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./policy";

function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter your email." })
  .max(254, { error: "Email is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` });

/** An existing password being re-entered (length capped so hashing cannot be abused). */
export const currentPasswordField = z
  .string()
  .min(1, { error: "Enter your password." })
  .max(PASSWORD_MAX_LENGTH, { error: "Password is incorrect." });

export const ownerNameField = z
  .string()
  .trim()
  .min(1, { error: "Enter your name." })
  .max(OWNER_NAME_MAX_LENGTH, { error: `Use at most ${OWNER_NAME_MAX_LENGTH} characters.` })
  .refine((v) => !hasControlCharacters(v), { error: "Name contains invalid characters." });

export const ownerAccountSchema = z.object({
  email: emailField,
  name: ownerNameField,
  password: newPasswordField,
});
export type OwnerAccountInput = z.input<typeof ownerAccountSchema>;

export const ownerSetupSchema = z
  .object({
    token: z.string().trim().min(1, { error: "Enter the setup token." }).max(512, { error: "Setup token is invalid." }),
    email: emailField,
    name: ownerNameField,
    password: newPasswordField,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type OwnerSetupInput = z.input<typeof ownerSetupSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordField,
    newPassword: newPasswordField,
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    error: "Choose a password different from the current one.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const passwordConfirmSchema = z.object({ password: currentPasswordField });
export type PasswordConfirmInput = z.input<typeof passwordConfirmSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, { error: "Enter the 6-digit code from your authenticator app." })),
});
export type TotpCodeInput = z.input<typeof totpCodeSchema>;

/** Flattens zod issues to one message per top-level field (ActionResult.fieldErrors shape). */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

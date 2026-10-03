"use client";

import { useCallback, useState } from "react";
import { useUnsavedChanges } from "@/components/app/unsaved-changes";

/**
 * One idempotency key per form instance (ARCHITECTURE §6). Call `renew` only after the server confirmed
 * success (`ok: true`), so a retry after a failure or a double submit reuses the same key.
 */
export function useIdempotencyKey(): [key: string, renew: () => void] {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return [key, renew];
}

export const DISCARD_MESSAGE = "Discard your changes? Nothing has been saved.";

/**
 * Warns before leaving a dirty form: registers it with the app's leave guard (in-app links, sign out) and the
 * beforeunload prompt (reloads, tab closes), and returns a guard to pass as a Dialog's `onRequestClose` (Esc, close
 * button, backdrop). The guard also refuses to close while `busy`.
 */
export function useUnsavedChangesGuard(dirty: boolean, busy = false, message = DISCARD_MESSAGE): () => boolean {
  useUnsavedChanges(dirty);

  return useCallback(() => {
    if (busy) return false;
    return !dirty || window.confirm(message);
  }, [busy, dirty, message]);
}

/** Server failure with optional per-field messages, kept in form state until the next submit. */
export interface FormFailure {
  message: string;
  fieldErrors: Record<string, string>;
}

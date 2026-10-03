"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One idempotency key per form instance (ARCHITECTURE §6). Call `renew` only after the server confirmed
 * success, so a retry after a failure or a double submit reuses the same key.
 */
export function useIdempotencyKey(): [key: string, renew: () => void] {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return [key, renew];
}

/**
 * Warns before leaving a dirty form: a beforeunload prompt for reloads and tab closes, plus a guard for a Dialog's
 * `onRequestClose` (Esc, close button, backdrop). The guard also keeps the dialog open while a save is pending.
 */
export function useLeaveGuard(dirty: boolean, pending: boolean, message: string): () => boolean {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return useCallback(() => {
    if (pending) return false;
    return !dirty || window.confirm(message);
  }, [dirty, pending, message]);
}

/**
 * A pending flag plus a synchronous in-flight lock, so a second click before React re-renders cannot start a
 * second request. `run` resolves to null when the call threw (network failure).
 */
export function useSubmitLock(): [pending: boolean, run: <T>(fn: () => Promise<T>) => Promise<T | null | undefined>] {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await fn();
    } catch {
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);
  return [pending, run];
}

/** Shown when a mutation's result never arrived. Retrying reuses the idempotency key, so it cannot apply twice. */
export const CONNECTION_PROBLEM = "We couldn't confirm this with the server. Check your connection and try again — retrying won't apply it twice.";

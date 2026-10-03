import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import type { ActionErrorCode } from "@/lib/action-result";
import type { ServiceContext } from "@/server/services/context";
import { ServiceError } from "@/server/services/errors";

/** 2026-10-10 12:00 in America/Toronto (EDT, UTC-4): local today = 2026-10-10. */
export const DEFAULT_NOW = new Date("2026-10-10T16:00:00Z");

export function ctxFor(ownerId: string, now: Date = DEFAULT_NOW): ServiceContext {
  return { ownerId, now };
}

/** A fresh idempotency key. */
export const key = (): string => randomUUID();

/** Awaits `promise`, expecting a ServiceError with `code` (and optionally a message for `field`). */
export async function expectServiceError(
  promise: Promise<unknown>,
  code: ActionErrorCode,
  field?: string,
): Promise<ServiceError> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected ServiceError(${code})`).toBeInstanceOf(ServiceError);
  const error = caught as ServiceError;
  expect({ code: error.code, message: error.message }).toMatchObject({ code });
  if (field) expect(error.fieldErrors?.[field], `fieldErrors.${field}`).toBeTruthy();
  return error;
}

/** An instant that is mid-day on `date` in America/Toronto (17:00Z = 12:00 EST / 13:00 EDT). */
export function noonToronto(date: string): Date {
  return new Date(`${date}T17:00:00Z`);
}

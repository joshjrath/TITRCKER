import "server-only";

import type { z } from "zod";

import type { LocalDate } from "@/domain";
import { withOwnerLocked, type AppSettingsRow, type OwnerTx } from "@/server/db/with-owner";

import type { ServiceContext } from "./context";
import { parseInput } from "./errors";
import { withIdempotency } from "./idempotency";
import { todayForSettings } from "./settings";

export interface MutationScope<D> {
  tx: OwnerTx;
  ownerId: string;
  /** The owner's settings row, locked FOR UPDATE for the whole transaction. */
  settings: AppSettingsRow;
  /** Local "today" in the owner's time zone. */
  today: LocalDate;
  data: D;
}

/**
 * The standard balance-affecting mutation pipeline (ARCHITECTURE §6):
 * validate input (shared zod schema) -> withOwner transaction -> lock settings -> idempotency ->
 * `fn` (load, validate with domain rules, write rows + audit) -> store response -> commit.
 */
export async function idempotentMutation<S extends z.ZodType<{ idempotencyKey: string }>, T>(
  ctx: ServiceContext,
  operation: string,
  schema: S,
  raw: z.input<S>,
  fn: (scope: MutationScope<z.output<S>>) => Promise<T>,
): Promise<T> {
  const data = parseInput(schema, raw);
  const { idempotencyKey, ...request } = data;
  return withOwnerLocked(ctx.ownerId, (tx, settings) =>
    withIdempotency(tx, ctx.ownerId, { key: idempotencyKey, operation, request }, () =>
      fn({ tx, ownerId: ctx.ownerId, settings, today: todayForSettings(settings, ctx.now), data }),
    ),
  );
}

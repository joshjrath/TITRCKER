/**
 * Every read model and export must read through withOwnerSnapshot (one REPEATABLE READ snapshot), never through
 * plain withOwner (READ COMMITTED, where each SELECT may see different committed writes and totals could disagree
 * with the records shown beside them).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb } from "@/server/db/client";
import * as withOwnerModule from "@/server/db/with-owner";
import { buildBackupExport, buildCsvExport } from "@/server/read-models/export";
import { getGiven } from "@/server/read-models/given";
import { getLedger } from "@/server/read-models/ledger";
import { getOverview } from "@/server/read-models/overview";
import { getSetAside } from "@/server/read-models/set-aside";
import { getSettingsPage } from "@/server/read-models/settings";
import { loadOwnerLedger } from "@/server/services/snapshot";

import { createTestUser, resetAppData } from "./helpers/db";
import { ctxFor } from "./helpers/services";

vi.mock("@/server/db/with-owner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db/with-owner")>();
  return {
    ...actual,
    withOwner: vi.fn(actual.withOwner),
    withOwnerLocked: vi.fn(actual.withOwnerLocked),
    withOwnerSnapshot: vi.fn(actual.withOwnerSnapshot),
  };
});

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
  vi.mocked(withOwnerModule.withOwner).mockClear();
  vi.mocked(withOwnerModule.withOwnerLocked).mockClear();
  vi.mocked(withOwnerModule.withOwnerSnapshot).mockClear();
});

const reads: [string, (ownerId: string) => Promise<unknown>][] = [
  ["getOverview", (id) => getOverview(ctxFor(id))],
  ["getLedger", (id) => getLedger(ctxFor(id))],
  ["getGiven", (id) => getGiven(ctxFor(id))],
  ["getSetAside", (id) => getSetAside(ctxFor(id))],
  ["getSettingsPage", (id) => getSettingsPage(ctxFor(id))],
  ["buildCsvExport", (id) => buildCsvExport(ctxFor(id))],
  ["buildBackupExport", (id) => buildBackupExport(ctxFor(id))],
  ["loadOwnerLedger", (id) => loadOwnerLedger(ctxFor(id))],
];

describe("read models use one snapshot per call", () => {
  it.each(reads)("%s reads through exactly one withOwnerSnapshot transaction", async (_name, read) => {
    await read(owner);
    expect(withOwnerModule.withOwnerSnapshot).toHaveBeenCalledTimes(1);
    expect(withOwnerModule.withOwnerSnapshot).toHaveBeenCalledWith(owner, expect.any(Function));
    expect(withOwnerModule.withOwner).not.toHaveBeenCalled();
    expect(withOwnerModule.withOwnerLocked).not.toHaveBeenCalled();
  });
});

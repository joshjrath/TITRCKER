import { describe, expect, it } from "vitest";
import { toLocalDate, toMinor, type Currency } from "@/domain";
import type { IncomeRowVM } from "@/lib/view-models";
import {
  DEFAULT_LEDGER_VIEW,
  dateBounds,
  entryCountText,
  filteredCsv,
  filteredCsvFilename,
  hasActiveFilters,
  selectRows,
  selectionTotals,
  toLedgerRow,
  type LedgerViewState,
} from "./ledger-view";

let seq = 0;
function row(p: {
  amount: number;
  currency?: Currency;
  on: string;
  source?: string | null;
  category?: string | null;
  note?: string | null;
  refunded?: number;
}): IncomeRowVM {
  seq += 1;
  const tithe = Math.floor((p.amount * 1000 + 5000) / 10000);
  const refunded = p.refunded ?? 0;
  const net = p.amount - refunded;
  const netTithe = Math.floor((net * 1000 + 5000) / 10000);
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    currency: p.currency ?? "CAD",
    amountMinor: toMinor(p.amount),
    receivedOn: toLocalDate(p.on),
    source: p.source === undefined ? `Source ${seq}` : p.source,
    category: p.category ?? null,
    note: p.note ?? null,
    titheMinor: toMinor(tithe),
    titheRateBps: 1000,
    refundedMinor: toMinor(refunded),
    netAmountMinor: toMinor(net),
    netTitheMinor: toMinor(netTithe),
    refundableMinor: toMinor(net),
    version: 1,
    createdAt: `2026-10-0${(seq % 9) + 1}T12:00:00.000Z`,
    updatedAt: `2026-10-0${(seq % 9) + 1}T12:00:00.000Z`,
    adjustments:
      refunded > 0
        ? [
            {
              id: `10000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
              kind: "refund",
              amountMinor: toMinor(refunded),
              effectiveOn: toLocalDate(p.on),
              reason: "Returned",
              titheDeltaMinor: toMinor(netTithe - tithe),
              createdAt: "2026-10-03T12:00:00.000Z",
            },
          ]
        : [],
  };
}

const salary = row({ amount: 175000, on: "2026-09-01", source: "Northwind Studio", category: "Salary" });
const gift = row({ amount: 12000, currency: "USD", on: "2026-09-15", source: "grandma", category: "Gift", note: "Birthday card" });
const design = row({ amount: 25000, on: "2026-08-20", source: "Freelance design", refunded: 5000 });
const anon = row({ amount: 500, on: "2026-09-30", source: null });
const all = [salary, gift, design, anon];
const view = (p: Partial<LedgerViewState>): LedgerViewState => ({ ...DEFAULT_LEDGER_VIEW, ...p });
const ids = (rows: readonly IncomeRowVM[]) => rows.map((r) => r.id);

describe("toLedgerRow", () => {
  it("keeps the money facts and links adjustments to the entry", () => {
    const lr = toLedgerRow(design);
    expect(lr.income.amountMinor).toBe(25000);
    expect(lr.netTitheMinor).toBe(2000);
    expect(lr.adjustments[0]?.incomeId).toBe(design.id);
    expect(lr.adjustments[0]?.titheDeltaMinor).toBe(-500);
  });
});

describe("selectRows", () => {
  it("defaults to newest first", () => {
    expect(ids(selectRows(all, DEFAULT_LEDGER_VIEW).rows)).toEqual(ids([anon, gift, salary, design]));
  });

  it("searches source, category and note case-insensitively", () => {
    expect(ids(selectRows(all, view({ query: "GRAND" })).rows)).toEqual([gift.id]);
    expect(ids(selectRows(all, view({ query: "salary" })).rows)).toEqual([salary.id]);
    expect(ids(selectRows(all, view({ query: "birthday" })).rows)).toEqual([gift.id]);
  });

  it("filters by inclusive date range and currency", () => {
    expect(ids(selectRows(all, view({ from: "2026-09-01", to: "2026-09-15" })).rows)).toEqual(ids([gift, salary]));
    expect(ids(selectRows(all, view({ currency: "USD" })).rows)).toEqual([gift.id]);
  });

  it("ignores half-typed dates", () => {
    expect(selectRows(all, view({ from: "2026-13-01" })).rows).toHaveLength(4);
  });

  it("sorts by amount and source both ways, entries without a source last", () => {
    expect(ids(selectRows(all, view({ sort: "amount_desc" })).rows)).toEqual(ids([salary, design, gift, anon]));
    expect(ids(selectRows(all, view({ sort: "source_asc" })).rows)).toEqual(ids([design, gift, salary, anon]));
    expect(ids(selectRows(all, view({ sort: "source_desc" })).rows)).toEqual(ids([salary, gift, design, anon]));
  });

  it("keeps newest first within one source when sorting Z–A", () => {
    const a1 = row({ amount: 100, on: "2026-09-01", source: "Acme" });
    const a2 = row({ amount: 100, on: "2026-09-10", source: "acme" });
    const b = row({ amount: 100, on: "2026-09-05", source: "Beta" });
    expect(ids(selectRows([a1, a2, b], view({ sort: "source_desc" })).rows)).toEqual(ids([b, a2, a1]));
  });
});

describe("selection totals", () => {
  it("totals each currency separately and only lists currencies present", () => {
    const totals = selectionTotals(selectRows(all, DEFAULT_LEDGER_VIEW).ledgerRows);
    expect(totals.map((t) => t.currency)).toEqual(["CAD", "USD"]);
    const cad = totals[0];
    expect(cad?.count).toBe(3);
    expect(cad?.grossMinor).toBe(200500);
    expect(cad?.refundedMinor).toBe(5000);
    expect(cad?.titheMinor).toBe(17500 + 2000 + 50);
    expect(totals[1]?.grossMinor).toBe(12000);
  });

  it("is empty when nothing matches", () => {
    expect(selectionTotals(selectRows(all, view({ query: "zzz" })).ledgerRows)).toEqual([]);
  });
});

describe("helpers", () => {
  it("detects active filters but not the sort", () => {
    expect(hasActiveFilters(view({ sort: "amount_asc" }))).toBe(false);
    expect(hasActiveFilters(view({ query: " x " }))).toBe(true);
    expect(hasActiveFilters(view({ currency: "CAD" }))).toBe(true);
  });

  it("flags an inverted date range", () => {
    expect(dateBounds({ from: "2026-10-01", to: "2026-09-01" }).inverted).toBe(true);
    expect(dateBounds({ from: "2026-09-01", to: "" }).inverted).toBe(false);
  });

  it("formats counts and the export filename", () => {
    expect(entryCountText(1)).toBe("1 entry");
    expect(entryCountText(12)).toBe("12 entries");
    expect(filteredCsvFilename("2026-10-03")).toBe("tenth-ledger-filtered-2026-10-03.csv");
  });

  it("exports only the selected rows plus per-currency totals", () => {
    const csv = filteredCsv(selectRows(all, view({ currency: "USD" })).ledgerRows);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(gift.id);
    expect(lines[2]).toMatch(/^filtered_total,,,USD,120\.00/);
  });
});

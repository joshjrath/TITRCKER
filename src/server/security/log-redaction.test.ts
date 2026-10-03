import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { installLogRedaction, redactLogArgument } from "./log-redaction";

function pgError(): Error {
  // Shape of a node-postgres DatabaseError for a CHECK violation.
  return Object.assign(new Error('new row for relation "income_entry" violates check constraint "income_entry_tithe_check"'), {
    name: "error",
    code: "23514",
    severity: "ERROR",
    detail: "Failing row contains (abc, owner, CAD, 175000, Salary from ACME, ...).",
    constraint: "income_entry_tithe_check",
  });
}

describe("redactLogArgument", () => {
  it("replaces a DrizzleQueryError (SQL params) with a data-free description", () => {
    const err = new DrizzleQueryError('insert into "income_entry" values ($1, $2)', [175000, "Salary from ACME"], pgError());
    const out = redactLogArgument(err);
    expect(typeof out).toBe("string");
    expect(out).toContain("23514");
    expect(String(out)).not.toMatch(/175000|ACME|Failing row|insert into/);
  });

  it("replaces bare pg errors and errors caused by one, keeping the Next.js digest", () => {
    expect(String(redactLogArgument(pgError()))).not.toContain("Failing row");
    const wrapped = Object.assign(new Error("render failed", { cause: pgError() }), { digest: "123@E1" });
    expect(redactLogArgument(wrapped)).toBe("[Error: database error 23514 (details redacted) digest=123@E1]");
  });

  it("strips a Drizzle params tail from strings and leaves other values alone", () => {
    expect(redactLogArgument("Failed query: select 1\nparams: 175000,Salary")).toBe("Failed query: select 1\nparams: [redacted]");
    const plain = new Error("Invalid Server Actions request.");
    expect(redactLogArgument(plain)).toBe(plain);
    expect(redactLogArgument({ level: "info" })).toEqual({ level: "info" });
    expect(redactLogArgument(42)).toBe(42);
  });
});

describe("installLogRedaction", () => {
  it("wraps console.error and console.warn once", () => {
    const error = vi.fn();
    const warn = vi.fn();
    const target = { error, warn, log: vi.fn() } as unknown as Console;
    installLogRedaction(target);
    installLogRedaction(target);
    target.error("⨯", new DrizzleQueryError("select $1", [99999], pgError()));
    target.warn("params: 5,secret");
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[1])).not.toContain("99999");
    expect(warn).toHaveBeenCalledWith("params: [redacted]");
  });
});

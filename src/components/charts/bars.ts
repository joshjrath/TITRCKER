/** Bar lengths for the monthly breakdown: tithe and paid share one scale (the largest of either). */
export function barFractions(
  rows: readonly { titheMinor: number; paidMinor: number }[],
): { tithe: number; paid: number }[] {
  let max = 0;
  for (const r of rows) max = Math.max(max, r.titheMinor, r.paidMinor);
  return rows.map((r) => ({
    tithe: max > 0 ? Math.max(0, r.titheMinor) / max : 0,
    paid: max > 0 ? Math.max(0, r.paidMinor) / max : 0,
  }));
}

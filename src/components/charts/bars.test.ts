import { describe, expect, it } from 'vitest';
import { barFractions } from './bars';

describe('barFractions', () => {
  it('scales tithe and paid against one shared maximum', () => {
    expect(
      barFractions([
        { titheMinor: 20_000, paidMinor: 0 },
        { titheMinor: 10_000, paidMinor: 40_000 },
      ]),
    ).toEqual([
      { tithe: 0.5, paid: 0 },
      { tithe: 0.25, paid: 1 },
    ]);
  });

  it('treats negative months (refunds) as empty bars and all-zero input as zero', () => {
    expect(barFractions([{ titheMinor: -500, paidMinor: 0 }])).toEqual([{ tithe: 0, paid: 0 }]);
    expect(barFractions([])).toEqual([]);
  });
});

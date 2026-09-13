import {
  computeBalances,
  paiseToRupeeString,
  rupeesToPaise,
  settle,
  splitEqually,
  type Balance,
} from '../src/services/expense-split';

/**
 * The split maths, in isolation.
 *
 * These are the properties that make a shared ledger trustworthy: shares
 * sum to the total, balances sum to zero, and the settlement plan is
 * minimal. The previous implementation divided in floating point and
 * rounded each row with toFixed(2), so ₹1000 across three people produced
 * three shares totalling ₹999.99.
 */

describe('rupee/paise conversion', () => {
  it('converts without floating-point drift', () => {
    expect(rupeesToPaise('1000')).toBe(100000);
    expect(rupeesToPaise('1000.00')).toBe(100000);
    expect(rupeesToPaise('12.34')).toBe(1234);
    expect(rupeesToPaise('0.05')).toBe(5);
    expect(rupeesToPaise(12.34)).toBe(1234);
    expect(paiseToRupeeString(1234)).toBe('12.34');
    expect(paiseToRupeeString(5)).toBe('0.05');
    expect(paiseToRupeeString(-1234)).toBe('-12.34');
  });
});

describe('splitEqually', () => {
  it('sums to exactly the total when the amount does not divide evenly', () => {
    const total = rupeesToPaise('1000'); // ₹1000 across 3
    const shares = splitEqually(total, ['u-c', 'u-a', 'u-b']);

    const values = [...shares.values()];
    expect(values.reduce((a, b) => a + b, 0)).toBe(total);
    // 333.34 / 333.33 / 333.33 — the extra paisa goes to exactly one person.
    expect(values.filter((v) => v === 33334)).toHaveLength(1);
    expect(values.filter((v) => v === 33333)).toHaveLength(2);
  });

  it('gives the remainder out in a deterministic order', () => {
    const total = rupeesToPaise('10'); // 1000 paise across 3 → 334/333/333
    const first = splitEqually(total, ['u-c', 'u-a', 'u-b']);
    const second = splitEqually(total, ['u-b', 'u-c', 'u-a']);

    // Same input set, same answer regardless of argument order — otherwise
    // balances would appear to shift between two reads of the same data.
    expect(first.get('u-a')).toBe(second.get('u-a'));
    expect(first.get('u-b')).toBe(second.get('u-b'));
    expect(first.get('u-c')).toBe(second.get('u-c'));
    expect(first.get('u-a')).toBe(334);
  });

  it('handles a single participant and an empty set', () => {
    expect(splitEqually(5000, ['solo']).get('solo')).toBe(5000);
    expect(splitEqually(5000, []).size).toBe(0);
  });
});

describe('computeBalances', () => {
  it('always nets to zero across participants', () => {
    const participants = ['a', 'b', 'c'];
    const balances = computeBalances(
      [
        { id: 'e1', amountPaise: rupeesToPaise('1000'), paidById: 'a', splitMode: 'EQUAL' },
        { id: 'e2', amountPaise: rupeesToPaise('55.55'), paidById: 'b', splitMode: 'EQUAL' },
      ],
      participants,
    );

    expect(balances.reduce((sum, b) => sum + b.netPaise, 0)).toBe(0);
    expect(balances.reduce((sum, b) => sum + b.owesPaise, 0)).toBe(
      rupeesToPaise('1000') + rupeesToPaise('55.55'),
    );
  });

  it('uses stored shares for a custom split instead of dividing equally', () => {
    const balances = computeBalances(
      [
        {
          id: 'e1',
          amountPaise: rupeesToPaise('900'),
          paidById: 'a',
          splitMode: 'CUSTOM',
          shares: [
            { userId: 'a', amountPaise: rupeesToPaise('100') },
            { userId: 'b', amountPaise: rupeesToPaise('800') },
          ],
        },
      ],
      ['a', 'b', 'c'],
    );

    const byId = new Map(balances.map((b) => [b.userId, b]));
    expect(byId.get('a')!.owesPaise).toBe(rupeesToPaise('100'));
    expect(byId.get('b')!.owesPaise).toBe(rupeesToPaise('800'));
    // Someone left out of a custom split owes nothing on it.
    expect(byId.get('c')!.owesPaise).toBe(0);
    expect(balances.reduce((sum, b) => sum + b.netPaise, 0)).toBe(0);
  });

  it('re-divides an existing expense when a member is added', () => {
    const expense = { id: 'e1', amountPaise: rupeesToPaise('900'), paidById: 'a', splitMode: 'EQUAL' as const };

    const twoWay = computeBalances([expense], ['a', 'b']);
    expect(twoWay.find((b) => b.userId === 'b')!.owesPaise).toBe(rupeesToPaise('450'));

    // The split is derived, not stored, so the third member changes it.
    const threeWay = computeBalances([expense], ['a', 'b', 'c']);
    expect(threeWay.find((b) => b.userId === 'b')!.owesPaise).toBe(rupeesToPaise('300'));
  });
});

describe('settle', () => {
  const netsToZero = (balances: Balance[]) => balances.reduce((s, b) => s + b.netPaise, 0) === 0;

  it('clears every balance in at most participants - 1 transfers', () => {
    const balances: Balance[] = [
      { userId: 'a', paidPaise: 90000, owesPaise: 30000, netPaise: 60000 },
      { userId: 'b', paidPaise: 0, owesPaise: 30000, netPaise: -30000 },
      { userId: 'c', paidPaise: 0, owesPaise: 30000, netPaise: -30000 },
    ];
    expect(netsToZero(balances)).toBe(true);

    const plan = settle(balances);
    expect(plan.length).toBeLessThanOrEqual(balances.length - 1);

    // Applying the plan leaves everyone at zero.
    const after = new Map(balances.map((b) => [b.userId, b.netPaise]));
    for (const t of plan) {
      after.set(t.fromUserId, after.get(t.fromUserId)! + t.amountPaise);
      after.set(t.toUserId, after.get(t.toUserId)! - t.amountPaise);
    }
    for (const remaining of after.values()) expect(remaining).toBe(0);
  });

  it('produces no transfers when everyone is square', () => {
    expect(
      settle([
        { userId: 'a', paidPaise: 5000, owesPaise: 5000, netPaise: 0 },
        { userId: 'b', paidPaise: 5000, owesPaise: 5000, netPaise: 0 },
      ]),
    ).toEqual([]);
  });

  it('settles an uneven four-way split exactly', () => {
    const balances = computeBalances(
      [
        { id: 'e1', amountPaise: rupeesToPaise('1000'), paidById: 'a', splitMode: 'EQUAL' },
        { id: 'e2', amountPaise: rupeesToPaise('333.33'), paidById: 'b', splitMode: 'EQUAL' },
        { id: 'e3', amountPaise: rupeesToPaise('47.77'), paidById: 'c', splitMode: 'EQUAL' },
      ],
      ['a', 'b', 'c', 'd'],
    );
    expect(netsToZero(balances)).toBe(true);

    const plan = settle(balances);
    expect(plan.length).toBeLessThanOrEqual(3);

    const after = new Map(balances.map((b) => [b.userId, b.netPaise]));
    for (const t of plan) {
      after.set(t.fromUserId, after.get(t.fromUserId)! + t.amountPaise);
      after.set(t.toUserId, after.get(t.toUserId)! - t.amountPaise);
    }
    for (const remaining of after.values()) expect(remaining).toBe(0);
  });
});

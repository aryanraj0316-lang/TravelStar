/**
 * Splitting a trip's expenses, and settling up.
 *
 * Every figure here is an integer number of paise. Money split in floating
 * point does not add up: ₹1000 across three people gives 333.333…, and
 * three `.toFixed(2)` shares sum to ₹999.99, so a ledger that looks right
 * on each row is a rupee short overall. The previous implementation did
 * exactly that. Rupees appear only at the response boundary, as strings
 * (docs/CONVENTIONS.md §3).
 *
 * Who a split covers: the trip's organizer plus every TripMember — one
 * share per member *account*, not per seat. A member who joined with three
 * family members occupies four seats but is one person paying one bill, so
 * charging them four shares of dinner would be wrong. A group that wants to
 * divide it by heads instead can use a CUSTOM split, which is the point of
 * having one.
 */

export const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(amount: string | number): number {
  // Via string so a float like 12.34 cannot arrive as 12.339999999999998.
  const [whole, fraction = ''] = String(amount).split('.');
  const paise = `${fraction}00`.slice(0, 2);
  const sign = whole!.trim().startsWith('-') ? -1 : 1;
  return sign * (Math.abs(parseInt(whole!, 10) || 0) * PAISE_PER_RUPEE + (parseInt(paise, 10) || 0));
}

export function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / PAISE_PER_RUPEE)}.${String(abs % PAISE_PER_RUPEE).padStart(2, '0')}`;
}

/**
 * Divides `totalPaise` across `userIds` so the shares always sum to exactly
 * the total.
 *
 * The remainder after an even division is handed out one paisa at a time,
 * in user-id order. Deterministic order matters: without it the same
 * expense could round differently between two reads and the balances would
 * appear to move on their own.
 */
export function splitEqually(totalPaise: number, userIds: string[]): Map<string, number> {
  const shares = new Map<string, number>();
  if (userIds.length === 0) return shares;

  const ordered = [...userIds].sort();
  const base = Math.floor(totalPaise / ordered.length);
  let remainder = totalPaise - base * ordered.length;

  for (const userId of ordered) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    shares.set(userId, base + extra);
  }
  return shares;
}

export interface Balance {
  userId: string;
  paidPaise: number;
  owesPaise: number;
  netPaise: number;
}

export interface Settlement {
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
}

/**
 * The smallest set of payments that clears every balance.
 *
 * Greedy largest-creditor against largest-debtor: each transfer zeroes at
 * least one of the two, so the plan can never need more than
 * `participants - 1` transfers. This is the part that makes the feature
 * feel accurate — a list of net balances still leaves everyone working out
 * who actually hands money to whom.
 */
export function settle(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.netPaise > 0)
    .map((b) => ({ userId: b.userId, amount: b.netPaise }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
  const debtors = balances
    .filter((b) => b.netPaise < 0)
    .map((b) => ({ userId: b.userId, amount: -b.netPaise }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      settlements.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountPaise: amount });
      creditor.amount -= amount;
      debtor.amount -= amount;
    }

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return settlements;
}

export interface ExpenseForSplit {
  id: string;
  amountPaise: number;
  paidById: string;
  splitMode: 'EQUAL' | 'CUSTOM';
  /** Only for CUSTOM; validated on write to sum to the expense total. */
  shares?: { userId: string; amountPaise: number }[];
}

/**
 * What each participant paid and owes across every expense on the trip.
 *
 * EQUAL splits are divided here rather than stored, so adding a member
 * after an expense exists changes that expense's split on the next read —
 * which is the intended behaviour, and is surfaced in the UI copy so it is
 * not a surprise.
 */
export function computeBalances(expenses: ExpenseForSplit[], participantIds: string[]): Balance[] {
  const paid = new Map<string, number>();
  const owes = new Map<string, number>();
  for (const id of participantIds) {
    paid.set(id, 0);
    owes.set(id, 0);
  }

  for (const expense of expenses) {
    paid.set(expense.paidById, (paid.get(expense.paidById) ?? 0) + expense.amountPaise);

    if (expense.splitMode === 'CUSTOM' && expense.shares && expense.shares.length > 0) {
      for (const share of expense.shares) {
        owes.set(share.userId, (owes.get(share.userId) ?? 0) + share.amountPaise);
      }
      continue;
    }

    const equal = splitEqually(expense.amountPaise, participantIds);
    for (const [userId, amount] of equal) {
      owes.set(userId, (owes.get(userId) ?? 0) + amount);
    }
  }

  // The output covers the union of current participants and anyone who
  // ever paid, not participantIds alone. Someone who paid for something and
  // then left the trip used to vanish from this list entirely — their
  // amountPaise was still counted in the trip's `total` (summed straight
  // from the expense rows, elsewhere), but their row, and the paisa they
  // are owed for it, disappeared from the balances and from settle()'s
  // plan. They rightly owe nothing further (an EQUAL split is re-derived
  // against the *current* roster, which no longer includes them — that
  // part is intentional, see this function's own history), but what they
  // already paid does not stop being real money the remaining group owes.
  const allIds = new Set([...participantIds, ...paid.keys()]);

  return [...allIds].map((userId) => {
    const paidPaise = paid.get(userId) ?? 0;
    const owesPaise = owes.get(userId) ?? 0;
    return { userId, paidPaise, owesPaise, netPaise: paidPaise - owesPaise };
  });
}

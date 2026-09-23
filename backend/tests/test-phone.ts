import crypto from 'node:crypto';

/**
 * A valid, practically-unique Indian mobile number for a test account.
 *
 * Registration requires one and the column is unique. Suites run in parallel
 * workers against a shared database that is not always cleaned between runs,
 * so a counter would collide — a random 9-digit tail under a leading 9 gives a
 * billion possibilities, which keeps accidental collisions out of reach.
 */
export function uniqueTestPhone(): string {
  return `9${crypto.randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

// Tracks consecutive failed logins per email to support progressive lockout.
//
// This is intentionally in-process for now: it is a security control, not
// business data, and losing it on restart fails open to "not locked" rather
// than locking a legitimate user out. Phase 11 moves this to Redis alongside
// the other shared state, which is also what makes it correct across instances.

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

export function isLockedOut(email: string): boolean {
  const rec = attempts.get(key(email));
  if (!rec?.lockedUntil) return false;
  if (rec.lockedUntil > Date.now()) return true;
  attempts.delete(key(email));
  return false;
}

export function recordFailure(email: string): void {
  const k = key(email);
  const rec = attempts.get(k) ?? { failures: 0, lockedUntil: null };
  rec.failures += 1;
  if (rec.failures >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.failures = 0;
  }
  attempts.set(k, rec);
}

export function recordSuccess(email: string): void {
  attempts.delete(key(email));
}

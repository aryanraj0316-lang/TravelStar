/* eslint-disable no-console */
// Minimal console-backed logger so call sites don't reach for `console` directly.
// log/warn are dev-only; error always surfaces (and is where Sentry hooks in
// once Phase 11 client observability lands — see docs/REMEDIATION.md §11).

export const logger = {
  log: (...args: unknown[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: unknown[]) => console.error(...args),
};

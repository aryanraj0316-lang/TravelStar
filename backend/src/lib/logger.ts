/* eslint-disable no-console */
// Minimal console-backed logger so call sites don't reach for `console` directly.
// This is an interim seam only — docs/REMEDIATION.md Phase 11 replaces it with
// structured logging (pino), request-ID correlation, and PII scrubbing.

export const logger = {
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

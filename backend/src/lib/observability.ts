// Error reporting (docs/REMEDIATION.md Phase 11). Config-gated: it only
// does anything when SENTRY_DSN is set AND `@sentry/node` is installed
// (`npm i @sentry/node`). Until then every function here is a safe no-op,
// so the rest of the codebase can call `captureException` unconditionally.
//
// The dynamic require keeps `@sentry/node` an optional dependency — the
// build and tests do not need it present.
import { env } from '../config/env';
import { logger } from './logger';

type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (e: unknown, hint?: Record<string, unknown>) => void;
  setUser: (user: Record<string, unknown> | null) => void;
  flush: (timeoutMs?: number) => Promise<boolean>;
};

let sentry: SentryLike | null = null;

export function initObservability(): void {
  if (!env.SENTRY_DSN) {
    logger.info('[observability] SENTRY_DSN not set — error reporting disabled');
    return;
  }
  try {
    // Optional dependency — loaded only when actually configured, so the
    // build and test runs don't need `@sentry/node` present.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@sentry/node') as SentryLike;
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release: env.RELEASE_VERSION,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      // Never ship request bodies / headers to Sentry — they carry tokens
      // and PII. The structured logger already redacts; this is defence
      // in depth.
      sendDefaultPii: false,
      beforeSend(event: Record<string, unknown>) {
        delete event.request;
        return event;
      },
    });
    sentry = mod;
    logger.info('[observability] Sentry initialised');
  } catch {
    logger.warn('[observability] SENTRY_DSN is set but `@sentry/node` is not installed — run `npm i @sentry/node`');
  }
}

export function captureException(e: unknown, context?: Record<string, unknown>): void {
  if (sentry) sentry.captureException(e, context ? { extra: context } : undefined);
}

export function setUserContext(userId: string | null): void {
  // Only the opaque id — never email, phone, or coordinates.
  if (sentry) sentry.setUser(userId ? { id: userId } : null);
}

export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (sentry) {
    try {
      await sentry.flush(timeoutMs);
    } catch {
      /* best effort on shutdown */
    }
  }
}

/* eslint-disable no-console */
// Structured JSON logging (docs/REMEDIATION.md Phase 11). Emits one JSON
// object per line — level, timestamp, message, and any structured context —
// which any log aggregator can parse, with a redaction pass so tokens,
// passwords, Aadhaar numbers and raw coordinates never reach the logs.
//
// This is deliberately zero-dependency. Swapping the internals for `pino`
// (npm i pino pino-http) is a drop-in follow-up: keep this same
// `logger.log/warn/error/child` surface and hand the calls to a pino
// instance. The redaction list below is the contract to preserve.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: number =
  LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')] ?? 20;

// Keys whose values must never be logged in full, at any nesting depth.
const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'jwt',
  'secret',
  'aadhaar',
  'aadhaarnumber',
  'otp',
  'otpcode',
  'latitude',
  'longitude',
  'lat',
  'lng',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, args: unknown[], bindings: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const messageParts: string[] = [];
  let context: Record<string, unknown> = {};
  for (const arg of args) {
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      messageParts.push(String(arg));
    } else if (arg instanceof Error) {
      messageParts.push(arg.message);
      context.err = redact(arg);
    } else if (arg && typeof arg === 'object') {
      context = { ...context, ...(redact(arg) as Record<string, unknown>) };
    }
  }

  const record = {
    level,
    time: new Date().toISOString(),
    msg: messageParts.join(' '),
    ...bindings,
    ...context,
  };

  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  /** Returns a logger that attaches `bindings` (e.g. { requestId, userId }) to every line. */
  child: (bindings: Record<string, unknown>) => Logger;
}

function make(bindings: Record<string, unknown>): Logger {
  return {
    log: (...a) => emit('info', a, bindings),
    info: (...a) => emit('info', a, bindings),
    warn: (...a) => emit('warn', a, bindings),
    error: (...a) => emit('error', a, bindings),
    debug: (...a) => emit('debug', a, bindings),
    child: (extra) => make({ ...bindings, ...extra }),
  };
}

export const logger: Logger = make({});

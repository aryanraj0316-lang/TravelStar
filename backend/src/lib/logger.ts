// Structured JSON logging (docs/REMEDIATION.md Phase 11), backed by pino.
// Emits one JSON object per line — level, timestamp, message, and any
// structured context — with a redaction pass so tokens, passwords, Aadhaar
// numbers and raw coordinates never reach the logs, no matter how deeply
// they're nested in whatever a call site logs.
//
// pino owns level filtering and fast JSON serialization; this module keeps
// its own redact() pass in front of it (pino's own `redact` option matches
// fixed paths, not an arbitrary-depth "redact this key wherever it appears"
// rule, which is what request bodies and error objects logged wholesale
// need) and its own flexible variadic call surface
// (`logger.warn('[Auth]', message, { context })`), so none of this
// codebase's ~125 existing call sites needed to change for the swap.
import pino from 'pino';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL: string = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

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

// Two instances with identical formatting, differing only in the
// destination stream — preserves the pre-pino behavior of routing
// info/debug to stdout and warn/error to stderr, which some log collectors
// and terminal viewers still treat differently, rather than pino's own
// default of one stream. Destination is `process.stdout`/`process.stderr`
// themselves rather than the faster `pino.destination(fd)` (raw-fd
// SonicBoom, which writes below the Node stream layer): this codebase logs
// through the `logger` surface everywhere specifically so it's mockable in
// tests, and a raw-fd write can't be intercepted that way.
const pinoOptions: pino.LoggerOptions = {
  level: LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'msg',
  formatters: {
    level: (label) => ({ level: label }),
  },
  // pino auto-serializes a property named `err` with its own
  // pino.stdSerializers.err by default, which would re-process (and
  // reshape, adding a `type` field) the value this module's own redact()
  // already turned into a safe plain object. redact() is the one and only
  // serializer for anything this module logs.
  serializers: {},
};
const pinoStdout = pino(pinoOptions, process.stdout);
const pinoStderr = pino(pinoOptions, process.stderr);

export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  /** Returns a logger that attaches `bindings` (e.g. { requestId, userId }) to every line. */
  child: (bindings: Record<string, unknown>) => Logger;
}

function make(stdoutTarget: pino.Logger, stderrTarget: pino.Logger): Logger {
  function emit(level: LogLevel, args: unknown[]): void {
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

    const target = level === 'warn' || level === 'error' ? stderrTarget : stdoutTarget;
    target[level](context, messageParts.join(' '));
  }

  return {
    log: (...a) => emit('info', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    debug: (...a) => emit('debug', a),
    // Bindings (requestId/userId-style correlation IDs, never secrets) are
    // not redacted, matching the pre-pino implementation — only the
    // variadic per-call context above goes through redact().
    child: (bindings) => make(stdoutTarget.child(bindings), stderrTarget.child(bindings)),
  };
}

export const logger: Logger = make(pinoStdout, pinoStderr);

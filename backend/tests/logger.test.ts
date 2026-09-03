import { logger } from '../src/lib/logger';

// This locks in the logger's current behavior — level filtering, JSON shape,
// and (most importantly) the redaction pass that keeps Aadhaar numbers,
// tokens, and coordinates out of the logs (docs/REMEDIATION.md Phase 11) —
// as a regression guard before swapping the internals for pino.

function captured(spy: jest.SpyInstance): Record<string, unknown>[] {
  // pino writes each line as a string/Buffer, newline-terminated, straight
  // to the destination stream's write() — not via console.log/warn/error,
  // so that's what a test has to intercept to observe what actually landed
  // on stdout vs stderr (the pre-pino implementation's exact console.*
  // routing was an implementation detail; which stream a line lands on is
  // the actual externally-observable contract).
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])));
}

describe('logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('emits one JSON object per line with level, time, and msg', () => {
    logger.info('hello world');
    const [record] = captured(stdoutSpy);
    expect(record.level).toBe('info');
    expect(record.msg).toBe('hello world');
    expect(typeof record.time).toBe('string');
    expect(new Date(record.time as string).toString()).not.toBe('Invalid Date');
  });

  it('routes warn and error to stderr, not stdout', () => {
    logger.warn('a warning');
    logger.error('an error');
    expect(captured(stderrSpy)[0].level).toBe('warn');
    expect(captured(stderrSpy)[1].level).toBe('error');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('merges a trailing context object into the record', () => {
    logger.info('user action', { userId: 'u1', action: 'join' });
    const [record] = captured(stdoutSpy);
    expect(record.userId).toBe('u1');
    expect(record.action).toBe('join');
  });

  it('serializes an Error argument as message + redacted err context', () => {
    logger.error(new Error('boom'));
    const [record] = captured(stderrSpy);
    expect(record.msg).toBe('boom');
    expect(record.err).toMatchObject({ name: 'Error', message: 'boom' });
  });

  describe('redaction', () => {
    const sensitiveKeys = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'jwt',
      'secret',
      'aadhaar',
      'aadhaarNumber',
      'otp',
      'otpCode',
      'latitude',
      'longitude',
      'lat',
      'lng',
    ];

    it.each(sensitiveKeys)('redacts a top-level "%s" field', (key) => {
      logger.info('context test', { [key]: 'super-secret-value' });
      const [record] = captured(stdoutSpy);
      expect(record[key]).toBe('[redacted]');
      expect(JSON.stringify(record)).not.toContain('super-secret-value');
    });

    it('redacts sensitive keys nested arbitrarily deep', () => {
      logger.info('nested', {
        user: { profile: { emergencyContact: { phone: '123', token: 'deep-secret' } } },
      });
      const [record] = captured(stdoutSpy);
      const user = record.user as Record<string, unknown>;
      const profile = user.profile as Record<string, unknown>;
      const contact = profile.emergencyContact as Record<string, unknown>;
      expect(contact.token).toBe('[redacted]');
      expect(JSON.stringify(record)).not.toContain('deep-secret');
    });

    it('redacts sensitive keys inside arrays of objects', () => {
      logger.info('bulk', { users: [{ id: 1, password: 'p1' }, { id: 2, password: 'p2' }] });
      const [record] = captured(stdoutSpy);
      const users = record.users as Record<string, unknown>[];
      expect(users[0].password).toBe('[redacted]');
      expect(users[1].password).toBe('[redacted]');
    });

    it('redacts real GPS coordinates (lat/lng) — never logged in the clear', () => {
      logger.info('SOS triggered', { latitude: 28.6139, longitude: 77.209 });
      const [record] = captured(stdoutSpy);
      expect(record.latitude).toBe('[redacted]');
      expect(record.longitude).toBe('[redacted]');
    });

    it('is case-insensitive on the key name', () => {
      logger.info('case test', { PASSWORD: 'secret', Token: 'secret2' });
      const [record] = captured(stdoutSpy);
      expect(record.PASSWORD).toBe('[redacted]');
      expect(record.Token).toBe('[redacted]');
    });

    it('does not redact keys that merely contain a sensitive substring', () => {
      // e.g. a "tokenCount" field is a number, not a credential — over-eager
      // redaction would make ordinary logs useless.
      logger.info('non-sensitive', { tokenCount: 5 });
      const [record] = captured(stdoutSpy);
      expect(record.tokenCount).toBe(5);
    });

    it('leaves ordinary fields untouched', () => {
      logger.info('ordinary', { tripId: 'trip-1', status: 'CONFIRMED', count: 3 });
      const [record] = captured(stdoutSpy);
      expect(record.tripId).toBe('trip-1');
      expect(record.status).toBe('CONFIRMED');
      expect(record.count).toBe(3);
    });

    it('redacts a sensitive field inside an Error object logged as context', () => {
      const err = new Error('failed') as Error & { token?: string };
      err.token = 'leaked-if-not-redacted';
      logger.error('request failed', err);
      const [record] = captured(stderrSpy);
      expect(JSON.stringify(record)).not.toContain('leaked-if-not-redacted');
    });
  });

  describe('child', () => {
    it('attaches bindings to every subsequent line', () => {
      const child = logger.child({ requestId: 'req-1', userId: 'u1' });
      child.info('handled');
      const [record] = captured(stdoutSpy);
      expect(record.requestId).toBe('req-1');
      expect(record.userId).toBe('u1');
      expect(record.msg).toBe('handled');
    });

    it('does not leak bindings back onto the parent logger', () => {
      logger.child({ requestId: 'req-only-on-child' });
      logger.info('parent line');
      const [record] = captured(stdoutSpy);
      expect(record.requestId).toBeUndefined();
    });

    it('lets a context object override a bound field for one line', () => {
      const child = logger.child({ userId: 'bound-user' });
      child.info('override test', { userId: 'explicit-user' });
      const [record] = captured(stdoutSpy);
      expect(record.userId).toBe('explicit-user');
    });
  });
});

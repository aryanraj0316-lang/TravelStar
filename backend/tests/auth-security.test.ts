import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for the Phase 2 security fixes in
 * docs/REMEDIATION.md — the account-takeover bug, password hashing, the
 * global auth requirement, and ownership checks on the highest-risk
 * endpoints (SOS resolution, guide profile creation).
 *
 * Runs against the real configured DATABASE_URL (there is no separate
 * throwaway/Testcontainers Postgres available in this environment — see
 * Phase 13). Every user this suite creates is deleted in afterAll so re-runs
 * stay idempotent and demo/seed data is untouched.
 */

const runId = Date.now();
const createdEmails: string[] = [];

function uniqueEmail(label: string): string {
  const email = `test-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  return email;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/register', () => {
  const email = uniqueEmail('register');
  const password = 'correcthorsebattery';

  it('creates a new account and returns a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email, password });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe('TOURIST');
  });

  it('never lets a client self-assign a role', async () => {
    const escalationEmail = uniqueEmail('escalation');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Escalator', email: escalationEmail, password, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('TOURIST');
  });

  it('returns 409 and issues no token when the email is already registered (the account-takeover bug)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Someone Else', email, password: 'aDifferentPassword1' });

    expect(res.status).toBe(409);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects passwords under the minimum length', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: uniqueEmail('weak'), password: 'short' });

    expect(res.status).toBe(400);
  });

  it('stores an argon2 hash, never the plaintext password', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(password);
    expect(user?.passwordHash?.startsWith('$argon2')).toBe(true);
  });
});

describe('POST /api/v1/auth/login', () => {
  const email = uniqueEmail('login');
  const password = 'correcthorsebattery';

  beforeAll(async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'Login Test', email, password });
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('accepts the correct password and returns a token pair', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('gives the same response shape for a nonexistent email as a wrong password (no account enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `no-such-user-${runId}@travelstar.test`, password: 'whatever12' });
    expect(res.status).toBe(401);
  });
});

describe('Global auth requirement', () => {
  it('rejects a request to a protected endpoint with no token', async () => {
    const res = await request(app).get('/api/v1/auth/profile');
    expect(res.status).toBe(401);
  });

  it('rejects a request with a garbage token', async () => {
    const res = await request(app).get('/api/v1/auth/profile').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(403);
  });

  it('allows public browse endpoints with no token', async () => {
    const res = await request(app).get('/api/v1/trips');
    expect(res.status).toBe(200);
  });

  it('still requires a token for a mutation, even one whose GET sibling is public', async () => {
    const res = await request(app).post('/api/v1/trips').send({ name: 'Should not be created' });
    expect(res.status).toBe(401);
  });
});

describe('IDOR: SOS alert resolution (docs/REMEDIATION.md §2.5)', () => {
  const victimEmail = uniqueEmail('sos-victim');
  const attackerEmail = uniqueEmail('sos-attacker');
  let victimToken: string;
  let attackerToken: string;
  let alertId: string;

  beforeAll(async () => {
    const victim = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Victim', email: victimEmail, password: 'correcthorsebattery' });
    victimToken = victim.body.token;

    const attacker = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Attacker', email: attackerEmail, password: 'correcthorsebattery' });
    attackerToken = attacker.body.token;

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${victimToken}`)
      .send({ userName: 'Victim', latitude: 28.6, longitude: 77.2 });
    alertId = sos.body.alertId;
  });

  it('refuses to let an unrelated user resolve someone else\'s active SOS alert', async () => {
    const res = await request(app)
      .post(`/api/v1/safety/sos/${alertId}/resolve`)
      .set('Authorization', `Bearer ${attackerToken}`);
    expect(res.status).toBe(403);
  });

  it('lets the alerting user resolve their own alert', async () => {
    const res = await request(app)
      .post(`/api/v1/safety/sos/${alertId}/resolve`)
      .set('Authorization', `Bearer ${victimToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Guide verification (docs/REMEDIATION.md §2.6)', () => {
  const email = uniqueEmail('guide-applicant');
  let token: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Guide Applicant', email, password: 'correcthorsebattery' });
    token = res.body.token;
  });

  it('never auto-creates a VERIFIED guide profile on GET', async () => {
    const res = await request(app).get('/api/v1/guides/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('a new application always starts PENDING, regardless of what the client sends', async () => {
    const res = await request(app)
      .post('/api/v1/guides/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        licenseNumber: `LIC-TEST-${runId}`,
        licensePhotoUrl: 'https://example.com/license.jpg',
        experienceYears: 3,
        expertisePlaces: ['Jaipur'],
        languagesSpoken: ['English'],
        hourlyRate: 100,
        dailyRate: 800,
        verifiedStatus: 'VERIFIED', // must be ignored
      });

    expect(res.status).toBe(201);
    expect(res.body.data.verifiedStatus).toBe('PENDING');
  });

  afterAll(async () => {
    await prisma.guideProfile.deleteMany({ where: { licenseNumber: `LIC-TEST-${runId}` } });
  });
});

describe('Refresh token rotation and reuse detection (docs/REMEDIATION.md §2.8)', () => {
  const email = uniqueEmail('refresh');
  let refreshToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Refresh Test', email, password: 'correcthorsebattery' });
    refreshToken = res.body.refreshToken;
  });

  it('rotates the refresh token on use', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('treats replaying the now-rotated token as reuse and revokes the session', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_REUSED');
  });
});

import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';
import crypto from 'node:crypto';
import { hashResetToken } from '../src/services/session';

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
      .send({ name: 'Test User', email, phoneNumber: uniqueTestPhone(), password });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('TOURIST');
  });

  it('never lets a client self-assign a role', async () => {
    const escalationEmail = uniqueEmail('escalation');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Escalator', email: escalationEmail, phoneNumber: uniqueTestPhone(), password, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('TOURIST');
  });

  it('returns 409 and issues no token when the email is already registered (the account-takeover bug)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Someone Else', email, phoneNumber: uniqueTestPhone(), password: 'aDifferentPassword1' });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.data).toBeUndefined();
  });

  it('rejects passwords under the minimum length', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: uniqueEmail('weak'), phoneNumber: uniqueTestPhone(), password: 'short' });

    expect(res.status).toBe(400);
  });

  it('stores an argon2 hash, never the plaintext password', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(password);
    expect(user?.passwordHash?.startsWith('$argon2')).toBe(true);
  });
});

describe('POST /api/v1/auth/login (mobile number only)', () => {
  const email = uniqueEmail('login');
  const password = 'correcthorsebattery';
  const phone = uniqueTestPhone();

  beforeAll(async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Login Test', email, phoneNumber: phone, password });
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ phoneNumber: phone, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('accepts the correct mobile number and password and returns a token pair', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ phoneNumber: phone, password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('accepts the same number written with a country code, spaces or a leading zero', async () => {
    for (const spelling of [`+91${phone}`, `0${phone}`, `${phone.slice(0, 5)} ${phone.slice(5)}`]) {
      const res = await request(app).post('/api/v1/auth/login').send({ phoneNumber: spelling, password });
      expect(res.status).toBe(200);
    }
  });

  it('no longer accepts email as a way to sign in', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(400);
  });

  it('gives the same response for an unregistered number as a wrong password (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ phoneNumber: uniqueTestPhone(), password: 'whatever12' });
    expect(res.status).toBe(401);
  });
});

describe('Indian mobile number rules on registration', () => {
  const password = 'correcthorsebattery';

  it('requires a mobile number', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'No Phone', email: uniqueEmail('nophone'), password });
    expect(res.status).toBe(400);
  });

  it.each([
    ['too short', '98765'],
    ['too long', '98765432101'],
    ['a landline series (starts with 5)', '5876543210'],
    ['letters', '98765abcde'],
    ['a foreign number', '+14155550123'],
  ])('rejects %s', async (_label, phoneNumber) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Bad Phone', email: uniqueEmail(`bad-${_label.length}`), phoneNumber, password });
    expect(res.status).toBe(400);
  });

  it('stores the number in one canonical +91 form', async () => {
    const phone = uniqueTestPhone();
    const email = uniqueEmail('canonical');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Canonical', email, phoneNumber: `0${phone.slice(0, 5)}-${phone.slice(5)}`, password });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.phoneNumber).toBe(`+91${phone}`);
  });

  it('refuses a second account on a number that is already registered', async () => {
    const phone = uniqueTestPhone();
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'First', email: uniqueEmail('dup-a'), phoneNumber: phone, password });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Second', email: uniqueEmail('dup-b'), phoneNumber: `+91${phone}`, password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_ALREADY_REGISTERED');
    expect(res.body.data).toBeUndefined();
  });
});

describe('Password reset by emailed 6-digit code', () => {
  const email = uniqueEmail('reset');
  const phone = uniqueTestPhone();
  const oldPassword = 'correcthorsebattery';
  const newPassword = 'batterystaplehorse9';
  let userId: string;

  /** Plants a code the test knows, hashed exactly as the route does. */
  async function plantCode(otp: string): Promise<string> {
    await prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    const id = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: { id, userId, tokenHash: hashResetToken(`${id}:${otp}`), expiresAt: new Date(Date.now() + 600_000) },
    });
    return id;
  }

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Reset Test', email, phoneNumber: phone, password: oldPassword });
    userId = res.body.data.user.id;
  });

  it('issues a code for a registered number and says where it went, masked', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ phoneNumber: phone });
    expect(res.status).toBe(200);
    expect(res.body.data.maskedEmail).toMatch(/^te\*+@travelstar\.test$/);
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(1);
  });

  it('does not re-issue a code within the resend cooldown', async () => {
    const before = await prisma.passwordResetToken.count({ where: { userId } });
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ phoneNumber: phone });
    expect(res.status).toBe(200);
    expect(res.body.data.retryAfterSeconds).toBeGreaterThan(0);
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(before);
  });

  it('answers an unregistered number the same way, without an address', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ phoneNumber: uniqueTestPhone() });
    expect(res.status).toBe(200);
    expect(res.body.data.maskedEmail).toBeUndefined();
  });

  it('resets the password with the right code and ends every existing session', async () => {
    await plantCode('482913');
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ phoneNumber: phone, otp: '482913', password: newPassword });
    expect(res.status).toBe(200);

    expect((await request(app).post('/api/v1/auth/login').send({ phoneNumber: phone, password: oldPassword })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ phoneNumber: phone, password: newPassword })).status).toBe(200);
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it('will not accept the same code twice', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ phoneNumber: phone, otp: '482913', password: 'anotherPassword7' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('burns a code after five wrong attempts, even if the right one comes next', async () => {
    await plantCode('111222');
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ phoneNumber: phone, otp: '999999', password: 'anotherPassword7' });
      expect(res.status).toBe(400);
    }
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ phoneNumber: phone, otp: '111222', password: 'anotherPassword7' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Request a new one/);
  });
});

describe('Changing the mobile number on the profile', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Profile Phone', email: uniqueEmail('profile-phone'), phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
    token = res.body.data.token;
    userId = res.body.data.user.id;
  });

  it('rejects an invalid number instead of saving one the owner could never log in with', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '12345' });
    expect(res.status).toBe(400);
  });

  it('refuses to clear the number, since it is how the account signs in', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '' });
    expect(res.status).toBe(400);
  });

  it('refuses a number that already belongs to someone else', async () => {
    const taken = uniqueTestPhone();
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Holder', email: uniqueEmail('holder'), phoneNumber: taken, password: 'correcthorsebattery' });
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: taken });
    expect(res.status).toBe(409);
  });

  it('saves a valid new number in canonical form', async () => {
    const fresh = uniqueTestPhone();
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: `+91 ${fresh}` });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.phoneNumber).toBe(`+91${fresh}`);
  });
});

describe('Global auth requirement', () => {
  it('rejects a request to a protected endpoint with no token', async () => {
    const res = await request(app).get('/api/v1/auth/profile');
    expect(res.status).toBe(401);
  });

  // 401, not 403. An unverifiable token is a failure to authenticate, not a
  // valid session lacking permission — and the client's silent refresh flow
  // (src/services/api.ts) only fires on 401, so returning 403 here meant a
  // naturally expired 15-minute access token surfaced to the user as a raw
  // "Forbidden" instead of being refreshed transparently. The middleware was
  // corrected in src/middleware/auth.ts; this assertion was left behind.
  it('rejects a request with a garbage token', async () => {
    const res = await request(app).get('/api/v1/auth/profile').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
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
      .send({ name: 'Victim', email: victimEmail, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
    victimToken = victim.body.data.token;

    const attacker = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Attacker', email: attackerEmail, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
    attackerToken = attacker.body.data.token;

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${victimToken}`)
      .send({ userName: 'Victim', latitude: 28.6, longitude: 77.2 });
    alertId = sos.body.data.alertId;
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
      .send({ name: 'Guide Applicant', email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
    token = res.body.data.token;
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
      .send({ name: 'Refresh Test', email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
    refreshToken = res.body.data.refreshToken;
  });

  it('rotates the refresh token on use', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('treats replaying the now-rotated token as reuse and revokes the session', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });
});

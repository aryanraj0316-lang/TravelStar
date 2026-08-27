import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

// docs/REMEDIATION.md Phase 11: liveness vs readiness.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health & readiness endpoints', () => {
  it('GET /health is a dependency-free 200 and needs no auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /ready reports the database check', async () => {
    const res = await request(app).get('/ready');
    // Against the real configured DB this should be ready; either way the
    // shape must carry a per-dependency check map.
    expect([200, 503]).toContain(res.status);
    expect(res.body.data.checks).toHaveProperty('database');
    if (res.status === 200) {
      expect(res.body.data.checks.database).toBe('ok');
      expect(res.body.data.ready).toBe(true);
    }
  });
});

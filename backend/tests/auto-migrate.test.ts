import { failedMigrationsIn, migrationEnv } from '../src/lib/auto-migrate';

// The boot-time migration step (src/lib/auto-migrate.ts). Its DB behaviour
// — applying a pending migration, recovering an interrupted one — was
// verified against real Postgres; these cover the pure decisions.

describe('failedMigrationsIn', () => {
  it('extracts the failed migration names from a P3009 error', () => {
    const output = [
      'Error: P3009',
      'migrate found failed migrations in the target database, new migrations will not be applied.',
      'The `20261011090000_paid_booking_allocation_flow` migration started at 2026-10-13 07:55:01.123 UTC failed',
    ].join('\n');
    expect(failedMigrationsIn(output)).toEqual(['20261011090000_paid_booking_allocation_flow']);
  });

  it('reports nothing for other failures', () => {
    expect(failedMigrationsIn('Error: P1001 Can\'t reach database server')).toEqual([]);
  });
});

describe('migrationEnv', () => {
  it('keeps an explicit DIRECT_URL', () => {
    const env = migrationEnv({ DATABASE_URL: 'postgresql://u:p@h-pooler.x.neon.tech/db', DIRECT_URL: 'postgresql://u:p@direct/db' });
    expect(env.DIRECT_URL).toBe('postgresql://u:p@direct/db');
  });

  it('derives a direct (non-pooled) URL when only DATABASE_URL is set', () => {
    const env = migrationEnv({ DATABASE_URL: 'postgresql://u:p@ep-cool-123-pooler.ap-south-1.aws.neon.tech/db?sslmode=require&pgbouncer=true' });
    expect(env.DIRECT_URL).toBe('postgresql://u:p@ep-cool-123.ap-south-1.aws.neon.tech/db?sslmode=require');
  });

  it('falls back to DATABASE_URL as-is for a non-pooled host', () => {
    const env = migrationEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.DIRECT_URL).toBe('postgresql://u:p@localhost:5432/db');
  });
});

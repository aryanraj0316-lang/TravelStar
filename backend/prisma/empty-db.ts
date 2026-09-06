import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

/**
 * Empties every data table in the database DATABASE_URL currently points
 * to, leaving the schema/migration history untouched — no demo users, no
 * seeded reference content (destinations, weather, monsoon advisories,
 * hazard alerts, travel stories), nothing. Unlike prisma/seed.ts this does
 * NOT reseed anything afterward; the app is expected to show its real
 * empty states (see src/screens/home-screen.tsx etc.) until real users
 * create real data.
 *
 * Same safety gate as seed.ts, for the same reason: there is one
 * DATABASE_URL (a hosted Neon instance) used for both dev and prod, so a
 * hostname check can't tell them apart. Requires an explicit, per-run opt-in.
 *
 *   SEED_CONFIRM_WIPE=yes-wipe-this-database npm run db:empty
 */
function assertSafeToWipe() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`Refusing to wipe: NODE_ENV is "${nodeEnv}", expected development or test.`);
  }
  if (process.env.SEED_CONFIRM_WIPE !== 'yes-wipe-this-database') {
    throw new Error(
      'Refusing to wipe: this deletes every row in every table in the ' +
        'database currently pointed to by DATABASE_URL. Confirm you mean to ' +
        'run this against that specific database by setting:\n' +
        '  SEED_CONFIRM_WIPE=yes-wipe-this-database'
    );
  }
}

async function main() {
  assertSafeToWipe();
  logger.log('Emptying database (all data, schema untouched)...');

  const tables: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) {
    logger.log('No tables found — nothing to empty.');
    return;
  }

  const identifiers = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE;`);

  logger.log(`Emptied ${tables.length} tables. Database is now completely empty.`);
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

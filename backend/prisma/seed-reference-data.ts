import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger';
import { seedReferenceDataIfEmpty } from '../src/lib/seed-reference-data';

const prisma = new PrismaClient();

/**
 * CLI entry point for `npm run seed:reference` — run after
 * `prisma migrate deploy` on a fresh environment. The actual seeding logic
 * (including the SEED_DESTINATIONS catalogue data — see that file's header
 * for why only `Destination` is seeded) lives in
 * `src/lib/seed-reference-data.ts`, shared with `src/server.ts`, which calls
 * it non-fatally on every boot so a freshly provisioned or wiped database
 * self-heals on its very next deploy/restart with no manual step required.
 */
async function main() {
  await seedReferenceDataIfEmpty(prisma);
  logger.log('[seed-reference-data] Done.');
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

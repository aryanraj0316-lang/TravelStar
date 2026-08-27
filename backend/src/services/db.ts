import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Prisma Client singleton for PostgreSQL.
//
// Pool sizing (docs/REMEDIATION.md Phase 10): Prisma defaults to
// `num_cpus * 2 + 1` connections *per process*. Against Neon — where the
// connection budget belongs to the database, not to us — that number is set
// by the wrong side of the relationship, and a second instance doubles it.
// We stamp an explicit `connection_limit` and `pool_timeout` onto the URL so
// the pool is sized from the database's budget divided by the instance count.
function withPoolParams(url: string): string {
  try {
    const parsed = new URL(url);
    // Never override values an operator has already set on the URL itself —
    // a hand-tuned DATABASE_URL wins over our defaults.
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', String(env.DATABASE_POOL_SIZE));
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', String(env.DATABASE_POOL_TIMEOUT));
    }
    return parsed.toString();
  } catch {
    // A URL Prisma itself will reject shortly with a much better message —
    // don't fail here, and don't log the string (it carries the password).
    return url;
  }
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: withPoolParams(env.DATABASE_URL) } },
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

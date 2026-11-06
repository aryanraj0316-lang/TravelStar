import { logger } from '../lib/logger';
import 'dotenv/config';
import prisma from '../services/db';
import { migrateLegacyChatMedia } from '../services/privacy-maintenance';
import { eraseLegacyChatNamespace } from '../lib/object-storage';

async function main() {
  if (!process.argv.includes('--old-upload-links-expired')) {
    throw new Error(
      'First deploy all servers and wait at least 10 minutes for old upload links to expire. Then run with --old-upload-links-expired.',
    );
  }
  const remaining = () =>
    prisma.message.count({ where: { mediaUrl: { not: null }, NOT: { mediaUrl: { startsWith: 'chat-private:' } } } });
  let count = await remaining();
  while (count > 0) {
    await migrateLegacyChatMedia();
    const next = await remaining();
    if (next >= count)
      throw new Error('Legacy migration made no progress; inspect the failed asset before continuing.');
    count = next;
  }
  // Flush pending source deletions too, including after a previous failed run.
  while (await prisma.chatAttachment.count({ where: { legacyKey: { not: null } } })) await migrateLegacyChatMedia();
  // Old unattached/replaced files are not represented by Message rows.
  await eraseLegacyChatNamespace();
  logger.info('Private chat migration complete. Purge CDN caches and verify old public URLs return 403/404.');
}
void main()
  .catch((e) => {
    logger.error(e instanceof Error ? e.message : 'Migration failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

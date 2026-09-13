import prisma from '../services/db';
import { isObjectStorageConfigured } from '../lib/object-storage';

/**
 * Why a story renders blank.
 *
 * "Blank media" has several possible causes that all look identical on the
 * device — object storage not configured, a presigned PUT that 403'd and
 * left an empty object, a publicUrl pointing at a host the phone cannot
 * reach (localhost baked into a row), or a private bucket returning 403 on
 * GET. Guessing between them wastes time, so this prints the actual stored
 * URLs and the real HTTP status of each one.
 *
 *   npx ts-node src/scripts/diagnose-story-media.ts
 */

async function head(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const length = res.headers.get('content-length');
    const type = res.headers.get('content-type');
    return `${res.status} ${res.statusText} (type=${type ?? 'n/a'}, bytes=${length ?? 'n/a'})`;
  } catch (err) {
    return `UNREACHABLE — ${(err as Error).message}`;
  }
}

function classify(url: string | null): string | null {
  if (!url) return null;
  if (/^(file|content):/i.test(url)) {
    return 'LOCAL DEVICE URI — this only resolves on the uploader\'s own phone; every other viewer sees nothing.';
  }
  if (/^data:/i.test(url)) return 'INLINE DATA URI — stored in the row itself.';
  if (/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(url)) {
    return 'LOOPBACK HOST — unreachable from a real device on the LAN.';
  }
  return null;
}

async function main() {
  console.log('Object storage configured:', isObjectStorageConfigured());
  console.log('');

  const stories = await prisma.travelStory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, title: true, mediaType: true, mediaUrl: true, coverImg: true, createdAt: true },
  });

  if (stories.length === 0) {
    console.log('No stories in the database.');
    return;
  }

  for (const story of stories) {
    console.log(`— ${story.id}  ${story.createdAt.toISOString()}`);
    console.log(`  title:     ${story.title}`);
    console.log(`  mediaType: ${story.mediaType}`);

    for (const [field, url] of [
      ['mediaUrl', story.mediaUrl],
      ['coverImg', story.coverImg],
    ] as const) {
      if (!url) {
        console.log(`  ${field}:  (null)`);
        continue;
      }
      const note = classify(url);
      console.log(`  ${field}:  ${url}`);
      if (note) {
        console.log(`             ^ ${note}`);
      } else {
        console.log(`             ^ ${await head(url)}`);
      }
    }
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error('[diagnose-story-media] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

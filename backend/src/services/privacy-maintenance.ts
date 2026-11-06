import prisma from './db';
import { eraseLocalMedia } from './account-erasure';
import {
  eraseUserObjects,
  legacyChatKey,
  legacyChatPublicUrl,
  readLegacyChatObject,
  eraseLegacyChatObject,
  isObjectStorageConfigured,
  listLegacyChatObjects,
} from '../lib/object-storage';
import { attachmentRef, decodeChatImage } from './chat-attachments';
import { logger } from '../lib/logger';

export async function runMediaErasureJobs() {
  const jobs = await prisma.mediaErasureJob.findMany({ where: { nextAttemptAt: { lte: new Date() } }, take: 20 });
  for (const job of jobs) {
    try {
      await eraseLocalMedia(job.ownerId, job.localFiles);
      await eraseUserObjects(job.ownerId);
      if (Date.now() >= job.finishAfter.getTime()) {
        await prisma.mediaErasureJob.deleteMany({ where: { id: job.id } });
      } else {
        await prisma.mediaErasureJob.updateMany({ where: { id: job.id }, data: { nextAttemptAt: job.finishAfter } });
      }
    } catch {
      // Durable retry, including when bucket credentials are temporarily absent.
      await prisma.mediaErasureJob.updateMany({
        where: { id: job.id },
        data: { nextAttemptAt: new Date(Date.now() + 60_000) },
      });
      logger.warn('[privacy] Media erasure remains queued', { jobId: job.id });
    }
  }
}

/** Explicit migration, bounded per batch; never HTTP-fetch arbitrary user URLs. */
export async function migrateLegacyChatMedia(options: { strictCleanup?: boolean; knownSourcesOnly?: boolean } = {}) {
  const pending = await prisma.chatAttachment.findMany({
    where: { legacyKey: { not: null } },
    select: { id: true, legacyKey: true },
    take: 20,
  });
  for (const asset of pending) {
    await prisma.legacyChatMediaErasure.upsert({
      where: { key: asset.legacyKey! },
      create: { key: asset.legacyKey! },
      update: {},
    });
  }
  await eraseLegacySources(options.strictCleanup !== false);
  const messages = await prisma.message.findMany({
    where: {
      mediaUrl: { not: null },
      NOT: { mediaUrl: { startsWith: 'chat-private:' } },
      ...(options.knownSourcesOnly
        ? {
            OR: [
              { mediaUrl: { startsWith: 'data:image/' } },
              ...(isObjectStorageConfigured()
                ? [{ mediaUrl: { startsWith: legacyChatPublicUrl('chat-media/') } }]
                : []),
            ],
          }
        : {}),
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  for (const message of messages) {
    try {
      const key = legacyChatKey(message.mediaUrl!);
      const inline = message.mediaUrl!.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
      if (!key && !inline)
        throw new Error('Unrecognized legacy media reference requires operator review; original message preserved.');
      const image = key
        ? await readLegacyChatObject(key)
        : { contentType: inline![1]!, bytes: Buffer.from(inline![2]!, 'base64') };
      decodeChatImage(image.bytes.toString('base64'), image.contentType);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Message" WHERE "id" = ${message.id} FOR UPDATE`;
        const current = await tx.message.findUnique({ where: { id: message.id }, select: { mediaUrl: true } });
        if (current?.mediaUrl !== message.mediaUrl) return;
        const asset = await tx.chatAttachment.create({
          data: {
            ownerId: message.senderId,
            chatRoomId: message.chatRoomId,
            contentType: image.contentType,
            bytes: image.bytes,
            legacyKey: key,
          },
        });
        if (key) await tx.legacyChatMediaErasure.upsert({ where: { key }, create: { key }, update: {} });
        await tx.message.update({ where: { id: message.id }, data: { mediaUrl: attachmentRef(asset.id) } });
      });
    } catch (e) {
      if (options.strictCleanup !== false) throw e;
      logger.warn('[privacy] Legacy chat conversion remains pending; original message retained');
    }
  }
}

async function eraseLegacySources(strict: boolean) {
  const jobs = await prisma.legacyChatMediaErasure.findMany({ take: 20, orderBy: { createdAt: 'asc' } });
  for (const job of jobs) {
    try {
      // More than one message can reference the same old file, across batches.
      // Keep its source until every reference has a private replacement.
      if (await prisma.message.count({ where: { mediaUrl: legacyChatPublicUrl(job.key) } })) continue;
      await eraseLegacyChatObject(job.key);
      await prisma.$transaction([
        prisma.chatAttachment.updateMany({ where: { legacyKey: job.key }, data: { legacyKey: null } }),
        prisma.legacyChatMediaErasure.deleteMany({ where: { key: job.key } }),
      ]);
    } catch (e) {
      if (strict) throw e;
      logger.warn('[privacy] Legacy chat source revocation remains queued');
    }
  }
}

export async function advancePrivateChatMigration() {
  const id = 'private-chat-v1';
  const state = await prisma.privacyMaintenanceState.findUnique({ where: { id } });
  if (!state || state.completedAt) return;
  await migrateLegacyChatMedia({ strictCleanup: false, knownSourcesOnly: true });
  const remaining = await prisma.message.count({
    where: { mediaUrl: { not: null }, NOT: { mediaUrl: { startsWith: 'chat-private:' } } },
  });
  if (remaining) return;
  if (Date.now() < state.readyAfter.getTime()) {
    await prisma.privacyMaintenanceState.update({ where: { id }, data: { phase: 'WAITING_UPLOAD_EXPIRY' } });
    return;
  }
  if (!isObjectStorageConfigured()) {
    await prisma.privacyMaintenanceState.update({ where: { id }, data: { phase: 'AWAITING_STORAGE' } });
    return;
  }
  if (!state.inventoriedAt) {
    for await (const keys of listLegacyChatObjects()) {
      if (keys.length)
        await prisma.legacyChatMediaErasure.createMany({ data: keys.map((key) => ({ key })), skipDuplicates: true });
    }
    await prisma.privacyMaintenanceState.update({
      where: { id },
      data: { inventoriedAt: new Date(), phase: 'REVOKING' },
    });
  }
  await eraseLegacySources(false);
  if (
    !(await prisma.legacyChatMediaErasure.count()) &&
    !(await prisma.chatAttachment.count({ where: { legacyKey: { not: null } } }))
  ) {
    await prisma.privacyMaintenanceState.update({
      where: { id },
      data: { completedAt: new Date(), phase: 'COMPLETE' },
    });
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
export function startPrivacyMaintenance() {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runMediaErasureJobs();
    } catch (e) {
      logger.error('[privacy] Erasure worker failed', e);
    }
    try {
      await advancePrivateChatMigration();
    } catch {
      logger.warn('[privacy] Legacy chat migration will retry with server storage credentials');
    } finally {
      running = false;
    }
  };
  void run();
  timer = setInterval(() => {
    void run();
  }, 60_000);
  timer.unref();
}
export function stopPrivacyMaintenance() {
  if (timer) clearInterval(timer);
}

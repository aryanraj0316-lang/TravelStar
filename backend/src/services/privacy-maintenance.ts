import prisma from './db';
import { eraseLocalMedia } from './account-erasure';
import { eraseUserObjects, legacyChatKey, legacyChatPublicUrl, readLegacyChatObject, eraseLegacyChatObject } from '../lib/object-storage';
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
export async function migrateLegacyChatMedia() {
  const pending = await prisma.chatAttachment.findMany({
    where: { legacyKey: { not: null } },
    select: { id: true, legacyKey: true },
    take: 20,
  });
  for (const asset of pending) {
    // More than one message can reference the same old file, across batches.
    // Keep its source until every reference has a private replacement.
    if (await prisma.message.count({ where: { mediaUrl: legacyChatPublicUrl(asset.legacyKey!) } })) continue;
    await eraseLegacyChatObject(asset.legacyKey!);
    await prisma.chatAttachment.update({ where: { id: asset.id }, data: { legacyKey: null } });
  }
  const messages = await prisma.message.findMany({
    where: { mediaUrl: { not: null }, NOT: { mediaUrl: { startsWith: 'chat-private:' } } },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  for (const message of messages) {
    const key = legacyChatKey(message.mediaUrl!);
    const inline = message.mediaUrl!.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
    if (!key && !inline) {
      throw new Error('Unrecognized legacy media reference requires operator review; original message preserved.');
    }
    const image = key
      ? await readLegacyChatObject(key)
      : { contentType: inline![1]!, bytes: Buffer.from(inline![2]!, 'base64') };
    decodeChatImage(image.bytes.toString('base64'), image.contentType);
    await prisma.$transaction(async (tx) => {
      const asset = await tx.chatAttachment.create({
        data: {
          ownerId: message.senderId,
          chatRoomId: message.chatRoomId,
          contentType: image.contentType,
          bytes: image.bytes,
          legacyKey: key,
        },
      });
      await tx.message.update({ where: { id: message.id }, data: { mediaUrl: attachmentRef(asset.id) } });
    });
    // Source deletion is retried from legacyKey if the storage provider fails.
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

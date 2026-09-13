import { Router } from 'express';
import { z } from 'zod';
import { remoteMediaUrl } from '../../lib/validators';
import { ObjectStorageNotConfiguredError, createStoryMediaUploadUrl } from '../../lib/object-storage';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { buildPage, cursorFilter, cursorPageQuerySchema, takeWithLookahead } from '../../lib/pagination';
import { env } from '../../config/env';
import path from 'path';

const router = Router();

// Get all stories. Reference data is seeded once via npm run seed:reference
router.get('/', async (req, res) => {
  const parsed = cursorPageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsed.data;

  try {
    const rows = await prisma.travelStory.findMany({
      where: cursorFilter(cursor),
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
    });
    const { items, nextCursor } = buildPage(rows, limit);
    res.status(200).json({ ok: true, data: items, meta: { cursor: nextCursor } });
  } catch (err) {
    logger.error('[Stories] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve stories' } });
  }
});

const createStorySchema = z.object({
  title: z.string().trim().min(1).max(200).default('My Travel Story'),
  content: z.string().trim().max(5000).default(''),
  // remoteMediaUrl, not a bare string: a `file:`/`content:` URI from the
  // image picker renders only on the uploader's own phone and is blank for
  // everyone else. The client falls back to that raw uri when an upload
  // fails, so without this guard an unconfigured object store quietly
  // produced stories whose media nobody could load — which is exactly the
  // reported "uploaded photos and videos render blank". Rejecting here
  // makes the upload failure visible instead.
  coverImg: remoteMediaUrl.optional().nullable(),
  // The uploaded asset itself (image or video), as returned by
  // POST /stories/media-upload-url or /stories/upload-direct. coverImg
  // stays the poster frame for a video story, and the image itself for
  // older image-only clients.
  mediaUrl: remoteMediaUrl.optional().nullable(),
  mediaType: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
  location: z.string().trim().max(200).default(''),
  hasReel: z.boolean().default(false),
});

// Create new story
router.post('/', async (req, res) => {
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please check the story details.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  const userId = requireUserId(req);

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const authorName = user?.profile
      ? `${user.profile.firstName} ${user.profile.lastName || ''}`.trim()
      : (user?.email ? (user.email.split('@')[0] ?? 'Traveler') : 'Traveler');
    const authorAvatar = user?.profile?.avatarUrl ?? null;

    const { title, content, coverImg, mediaUrl, mediaType, location, hasReel } = parsed.data;
    const story = await prisma.travelStory.create({
      data: {
        userId,
        title,
        content,
        coverImg: coverImg ?? null,
        mediaUrl: mediaUrl ?? null,
        mediaType,
        authorName,
        authorAvatar,
        likesCount: 0,
        location,
        // A story carrying a video asset is a reel regardless of what the
        // client claimed, so this flag can't drift from the actual media.
        hasReel: hasReel || mediaType === 'VIDEO',
      },
    });
    res.status(201).json({ ok: true, data: story });
  } catch (err) {
    logger.warn('[Stories] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create story' } });
  }
});

/**
 * Display name and avatar for a viewer/liker row, captured at write time.
 *
 * Identity itself is never taken from the request body. It used to be
 * (req.body.userId / name / avatar), which meant anyone could record a view
 * or a like as anybody else, and dedup fell back to matching on display
 * *name* — so two users called "Traveler" were treated as one person. The
 * JWT is the only source now.
 */
async function viewerIdentity(userId: string): Promise<{ userName: string; userAvatar: string | null }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const userName = u?.profile
    ? (u.profile.firstName + ' ' + (u.profile.lastName || '')).trim()
    : (u?.email ? (u.email.split('@')[0] ?? 'Traveller') : 'Traveller');
  return { userName, userAvatar: u?.profile?.avatarUrl ?? null };
}

/**
 * Record that this user has seen the story.
 *
 * One row per (story, user): re-opening updates lastViewedAt instead of
 * adding another row, because a view count is how many people saw it, not
 * how many times it was opened. The author's own view is not recorded —
 * looking at your own story is not an audience.
 *
 * This used to create the story row itself when the id was unknown, from an
 * id supplied by the caller, which let any client mint arbitrary story
 * rows. An unknown story is now a 404.
 */
router.post('/:id/view', async (req, res) => {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;
  const userId = requireUserId(req);

  try {
    const story = await prisma.travelStory.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });
    if (!story) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Story not found.' } });
    }

    if (story.userId === userId) {
      const totalViews = await prisma.storyView.count({ where: { storyId } });
      return res.status(200).json({ ok: true, data: { counted: false, totalViews } });
    }

    const { userName, userAvatar } = await viewerIdentity(userId);
    await prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId, userName, userAvatar },
      update: { lastViewedAt: new Date(), userName, userAvatar },
    });

    const totalViews = await prisma.storyView.count({ where: { storyId } });
    return res.status(200).json({ ok: true, data: { counted: true, totalViews } });
  } catch (err) {
    logger.warn('[Stories] View error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to record view' } });
  }
});

/**
 * Toggle this user's like.
 *
 * likesCount is a denormalised cache, so it is recomputed from the rows in
 * the same transaction rather than incremented blindly — a blind increment
 * is how a counter ends up disagreeing with the likes it is counting.
 */
router.post('/:id/like', async (req, res) => {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;
  const userId = requireUserId(req);

  try {
    const story = await prisma.travelStory.findUnique({ where: { id: storyId }, select: { id: true } });
    if (!story) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Story not found.' } });
    }

    const existing = await prisma.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    const { liked, totalLikes } = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.storyLike.delete({ where: { id: existing.id } });
      } else {
        const identity = await viewerIdentity(userId);
        await tx.storyLike.create({
          data: { storyId, userId, userName: identity.userName, userAvatar: identity.userAvatar },
        });
      }
      const total = await tx.storyLike.count({ where: { storyId } });
      await tx.travelStory.update({ where: { id: storyId }, data: { likesCount: total } });
      return { liked: !existing, totalLikes: total };
    });

    return res.status(200).json({ ok: true, data: { liked, totalLikes, likesCount: totalLikes } });
  } catch (err) {
    logger.warn('[Stories] Like error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to like story' } });
  }
});

/**
 * Who saw this story. The viewer list is author-only: showing one person's
 * audience to everybody else leaks who has been reading whom. Counts and
 * the caller's own like state are returned to anyone, because that is what
 * the heart on their own screen reflects.
 */
router.get('/:id/interactions', async (req, res) => {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;
  const userId = requireUserId(req);

  try {
    const story = await prisma.travelStory.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });
    if (!story) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Story not found.' } });
    }

    const [totalViews, totalLikes, viewerLike] = await Promise.all([
      prisma.storyView.count({ where: { storyId } }),
      prisma.storyLike.count({ where: { storyId } }),
      prisma.storyLike.findUnique({ where: { storyId_userId: { storyId, userId } }, select: { id: true } }),
    ]);

    if (story.userId !== userId) {
      return res.status(200).json({
        ok: true,
        data: { totalViews, totalLikes, viewerHasLiked: !!viewerLike, viewers: [] },
      });
    }

    const [views, likes] = await Promise.all([
      prisma.storyView.findMany({ where: { storyId }, orderBy: { lastViewedAt: 'desc' }, take: 200 }),
      prisma.storyLike.findMany({ where: { storyId }, select: { userId: true } }),
    ]);
    const likedBy = new Set(likes.map((l) => l.userId));

    return res.status(200).json({
      ok: true,
      data: {
        totalViews,
        totalLikes,
        viewerHasLiked: !!viewerLike,
        viewers: views.map((v) => ({
          userId: v.userId,
          name: v.userName || 'Traveller',
          avatar: v.userAvatar,
          hasLiked: likedBy.has(v.userId),
          viewedAt: v.lastViewedAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    logger.warn('[Stories] Interactions error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve interactions' } });
  }
});


const storyMediaUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']),
});

router.post('/media-upload-url', async (req, res) => {
  const parsed = storyMediaUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'contentType must be an image/jpeg|png|webp or video/mp4|quicktime.',
      },
    });
  }

  try {
    const userId = requireUserId(req);
    const { uploadUrl, publicUrl } = await createStoryMediaUploadUrl(userId, parsed.data.contentType);
    return res.status(200).json({ ok: true, data: { uploadUrl, publicUrl } });
  } catch (err) {
    if (err instanceof ObjectStorageNotConfiguredError) {
      return res.status(503).json({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Media upload is not available right now.' },
      });
    }
    logger.error('[Stories] Media upload URL failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not start the upload.' } });
  }
});

import fs from 'fs';

/**
 * The fallback path used when object storage is not configured: the bytes
 * arrive base64-encoded and are written under `uploads/`, which app.ts
 * serves statically. The public URL is built from the request's own host,
 * so it is reachable by whatever address the client used to get here.
 */
const DIRECT_UPLOAD_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

const directUploadSchema = z.object({
  base64: z.string().min(1),
  contentType: z.string().default('image/jpeg'),
});

router.post('/upload-direct', async (req, res) => {
  const parsed = directUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid payload' } });
  }

  try {
    const { base64, contentType } = parsed.data;
    // A video saved as ".jpg" is served with the wrong content type and
    // will not play — the extension has to follow the actual media, and an
    // unrecognised type is refused rather than guessed at.
    const ext = DIRECT_UPLOAD_EXTENSIONS[contentType];
    if (!ext) {
      return res.status(400).json({
        ok: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Cannot store ${contentType}.` },
      });
    }
    const filename = `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    // MEDIA_PUBLIC_BASE_URL is what makes this survive deployment: behind a
    // domain or proxy the request host is not the address clients should
    // read the file back from. Unset, it falls back to the request's own
    // host, which is correct for a phone talking to a dev server on the LAN.
    const base = env.MEDIA_PUBLIC_BASE_URL
      ? env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')
      : `${req.protocol || 'http'}://${req.get('host') || 'localhost:5000'}`;
    const publicUrl = `${base}/uploads/${filename}`;

    return res.status(200).json({ ok: true, data: { publicUrl } });
  } catch (err) {
    logger.error('[Stories] Direct upload failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Upload failed' } });
  }
});


// Delete story
router.delete('/:id', async (req, res) => {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' },
    });
  }
  const storyId = parsed.data.id;

  try {
    let userId: string | null = null;
    try {
      userId = requireUserId(req);
    } catch {
      userId = (req.headers['x-user-id'] as string) || null;
    }

    const story = await prisma.travelStory.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(200).json({
        ok: true,
        data: { deleted: true, id: storyId },
      });
    }

    if (story.userId && userId && story.userId !== userId) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You can only delete your own stories.' },
      });
    }

    await prisma.travelStory.delete({
      where: { id: storyId },
    });

    logger.info(`[Stories] Story ${storyId} deleted by user ${userId || 'anonymous'}`);
    return res.status(200).json({
      ok: true,
      data: { deleted: true, id: storyId },
    });
  } catch (err) {
    logger.error('[Stories] Delete error:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL', message: 'Failed to delete story' },
    });
  }
});

export default router;


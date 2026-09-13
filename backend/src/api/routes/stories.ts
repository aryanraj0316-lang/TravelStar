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

// Helper to resolve viewer/liker identity from req & body
async function resolveUserIdentity(req: any) {
  let userId: string | null = req.user?.id || req.body?.userId || null;
  let userName: string = req.body?.name || req.body?.userName || '';
  let userAvatar: string | null = req.body?.avatar || req.body?.userAvatar || null;

  if (req.user?.id) {
    try {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, include: { profile: true } });
      if (u) {
        if (!userName) {
          if (u.profile?.firstName) {
            userName = `${u.profile.firstName} ${u.profile.lastName || ''}`.trim();
          } else if (u.email) {
            userName = u.email.split('@')[0] ?? 'Traveler';
          }
        }
        if (!userAvatar && u.profile?.avatarUrl) {
          userAvatar = u.profile.avatarUrl;
        }
      }
    } catch {
      // Ignore DB lookup error
    }
  }

  if (!userName || userName.trim().toLowerCase() === 'guest traveler') {
    userName = 'Traveler';
  }

  return { userId, userName, userAvatar };
}

// Record a view on a story
router.post('/:id/view', async (req, res) => {
  const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;

  try {
    const { userId, userName, userAvatar } = await resolveUserIdentity(req);

    // Auto-upsert story if not yet in database
    let story = await prisma.travelStory.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });

    if (!story) {
      try {
        story = await prisma.travelStory.create({
          data: {
            id: storyId,
            userId: userId ?? null,
            authorName: userName,
            authorAvatar: userAvatar,
            title: 'Travel Story',
            content: '',
            location: '',
            likesCount: 0,
            hasReel: false,
          },
        });
      } catch {
        story = await prisma.travelStory.findUnique({ where: { id: storyId }, select: { id: true, userId: true } });
      }
    }

    // Check if this viewer already recorded a view on this story
    const orConditions: any[] = [];
    if (userId) orConditions.push({ userId });
    if (userName && userName !== 'Traveler') orConditions.push({ userName });

    let existingView = null;
    if (orConditions.length > 0) {
      existingView = await prisma.storyView.findFirst({
        where: {
          storyId,
          OR: orConditions,
        },
      });
    }

    if (existingView) {
      await prisma.storyView.update({
        where: { id: existingView.id },
        data: {
          createdAt: new Date(),
          userName: userName || existingView.userName,
          userAvatar: userAvatar || existingView.userAvatar,
          userId: userId || existingView.userId,
        },
      });
    } else {
      await prisma.storyView.create({
        data: {
          storyId,
          userId,
          userName,
          userAvatar,
        },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.warn('[Stories] View error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to record view' } });
  }
});

// Like or unlike a story with user tracking
router.post('/:id/like', async (req, res) => {
  const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;

  try {
    const { userId, userName, userAvatar } = await resolveUserIdentity(req);

    let story = await prisma.travelStory.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      try {
        story = await prisma.travelStory.create({
          data: {
            id: storyId,
            userId: userId ?? null,
            authorName: userName,
            authorAvatar: userAvatar,
            title: 'Travel Story',
            content: '',
            location: '',
            likesCount: 0,
            hasReel: false,
          },
        });
      } catch {
        story = await prisma.travelStory.findUnique({ where: { id: storyId } });
      }
    }

    if (!story) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Story not found' } });
    }

    // Check if user already liked
    const orConditions: any[] = [];
    if (userId) orConditions.push({ userId });
    if (userName && userName !== 'Traveler') orConditions.push({ userName });

    let existingLike = null;
    if (orConditions.length > 0) {
      existingLike = await prisma.storyLike.findFirst({
        where: {
          storyId,
          OR: orConditions,
        },
      });
    }

    if (existingLike) {
      // Toggle off / Unlike
      const [, updatedStory] = await prisma.$transaction([
        prisma.storyLike.delete({ where: { id: existingLike.id } }),
        prisma.travelStory.update({
          where: { id: storyId },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);
      return res.status(200).json({
        ok: true,
        data: { liked: false, likesCount: Math.max(0, updatedStory.likesCount) },
      });
    } else {
      // Toggle on / Like
      const [, updatedStory] = await prisma.$transaction([
        prisma.storyLike.create({
          data: {
            storyId,
            userId,
            userName,
            userAvatar,
          },
        }),
        prisma.travelStory.update({
          where: { id: storyId },
          data: { likesCount: { increment: 1 } },
        }),
      ]);

      // Ensure liker is also recorded as a viewer
      let existingView = null;
      if (orConditions.length > 0) {
        existingView = await prisma.storyView.findFirst({
          where: {
            storyId,
            OR: orConditions,
          },
        });
      }
      if (!existingView) {
        await prisma.storyView.create({
          data: {
            storyId,
            userId,
            userName,
            userAvatar,
          },
        }).catch(() => {});
      }

      return res.status(200).json({
        ok: true,
        data: { liked: true, likesCount: updatedStory.likesCount },
      });
    }
  } catch (err) {
    logger.warn('[Stories] Like error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to like story' } });
  }
});

// Get interactions (viewer list & like status) for a story
router.get('/:id/interactions', async (req, res) => {
  const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  const storyId = parsedParams.data.id;

  try {
    const story = await prisma.travelStory.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, likesCount: true },
    });

    if (!story) {
      return res.status(200).json({
        ok: true,
        data: {
          totalViews: 0,
          totalLikes: 0,
          viewers: [],
        },
      });
    }

    const [views, likes] = await Promise.all([
      prisma.storyView.findMany({
        where: { storyId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.storyLike.findMany({
        where: { storyId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const likedIds = new Set<string>();
    const likedNames = new Set<string>();
    for (const l of likes) {
      if (l.userId) likedIds.add(l.userId);
      if (l.userName) likedNames.add(l.userName.toLowerCase().trim());
    }

    const viewerMap = new Map<string, {
      userId: string;
      name: string;
      avatar: string | null;
      hasLiked: boolean;
      viewedAt: string;
    }>();

    for (const v of views) {
      const name = v.userName?.trim() || 'Traveler';
      const key = v.userId ? `id:${v.userId}` : (name !== 'Traveler' ? `name:${name.toLowerCase()}` : `view:${v.id}`);
      const hasLiked = (v.userId ? likedIds.has(v.userId) : false) || (name !== 'Traveler' && likedNames.has(name.toLowerCase()));
      viewerMap.set(key, {
        userId: v.userId || v.id,
        name,
        avatar: v.userAvatar,
        hasLiked,
        viewedAt: v.createdAt.toISOString(),
      });
    }

    for (const l of likes) {
      const name = l.userName?.trim() || 'Traveler';
      const key = l.userId ? `id:${l.userId}` : (name !== 'Traveler' ? `name:${name.toLowerCase()}` : `like:${l.id}`);
      if (!viewerMap.has(key)) {
        viewerMap.set(key, {
          userId: l.userId || l.id,
          name,
          avatar: l.userAvatar,
          hasLiked: true,
          viewedAt: l.createdAt.toISOString(),
        });
      } else {
        const existing = viewerMap.get(key)!;
        existing.hasLiked = true;
      }
    }

    const viewersList = Array.from(viewerMap.values()).sort(
      (a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime()
    );

    return res.status(200).json({
      ok: true,
      data: {
        totalViews: Math.max(views.length, viewerMap.size),
        totalLikes: Math.max(story.likesCount, likes.length),
        viewers: viewersList,
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


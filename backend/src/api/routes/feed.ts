import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';

const router = Router();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.coerce.date().optional(),
});

// GET /api/v1/feed — Unified public feed (TravelStory + GuideReel merged)
router.get('/', async (req, res) => {
  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', code: 'VALIDATION_FAILED', message: 'Invalid feed query.' });
  }

  try {
    const { limit, cursor: cursorDate } = parsed.data;
    const cursorFilter = cursorDate ? { createdAt: { lt: cursorDate } } : {};

    // Fetch both content types in parallel
    const [stories, reels] = await Promise.all([
      prisma.travelStory.findMany({
        where: cursorFilter,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.guideReel.findMany({
        where: cursorFilter,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          guide: {
            include: {
              user: {
                include: { profile: true },
              },
            },
          },
        },
      }),
    ]);

    // Normalize stories
    const normalizedStories = stories.map((s) => ({
      id: s.id,
      sourceType: 'STORY' as const,
      title: s.title,
      coverImg: s.coverImg,
      authorName: s.authorName,
      authorAvatar: s.authorAvatar,
      location: s.location,
      likesCount: s.likesCount,
      hasReel: s.hasReel,
      content: s.content,
      createdAt: s.createdAt,
    }));

    // Normalize reels
    const normalizedReels = reels.map((r) => {
      const profile = r.guide?.user?.profile;
      const authorName = profile
        ? `${profile.firstName} ${profile.lastName || ''}`.trim()
        : 'Verified Guide';
      const authorAvatar = profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

      return {
        id: r.id,
        sourceType: 'REEL' as const,
        title: r.caption || 'Travel Reel',
        coverImg: r.thumbnailUrl || 'https://images.unsplash.com/photo-1548013146-72479768bada?w=300&q=80',
        authorName,
        authorAvatar,
        location: 'Guide Tour',
        likesCount: r.likesCount,
        hasReel: true,
        content: r.caption || '',
        viewsCount: r.viewsCount,
        videoUrl: r.videoUrl,
        createdAt: r.createdAt,
      };
    });

    // Merge and sort by createdAt descending
    const merged = [...normalizedStories, ...normalizedReels]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const lastItem = merged[merged.length - 1];
    const nextCursor = merged.length === limit && lastItem
      ? lastItem.createdAt.toISOString()
      : null;

    return res.status(200).json({
      status: 'success',
      data: merged,
      nextCursor,
    });
  } catch (err) {
    logger.error('[Feed] Get unified feed error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve feed' });
  }
});

export default router;

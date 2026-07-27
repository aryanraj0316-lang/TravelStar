import { Router } from 'express';
import prisma from '../../services/db';

const router = Router();

// GET /api/v1/feed — Unified public feed (TravelStory + GuideReel merged)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const cursorDate = cursor ? new Date(cursor) : undefined;
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

    const nextCursor = merged.length === limit
      ? merged[merged.length - 1].createdAt.toISOString()
      : null;

    return res.status(200).json({
      status: 'success',
      data: merged,
      nextCursor,
    });
  } catch (err) {
    console.error('[Feed] Get unified feed error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve feed' });
  }
});

export default router;

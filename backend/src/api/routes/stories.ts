import { Router } from 'express';
import prisma from '../../services/db';

const router = Router();

// Default seed data for travel stories
const SEED_STORIES = [
  {
    authorName: 'Aarav Sharma',
    authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    title: 'Spiritual Peace in Vrindavan',
    content: 'Experiencing the morning Aarti at Bankey Bihari Temple was truly divine...',
    coverImg: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
    likesCount: 24,
    location: 'Vrindavan, UP',
    hasReel: false,
  },
  {
    authorName: 'Anjali Sharma',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    title: 'Conquering Khardung La Pass',
    content: 'Riding through the cold winds of Ladakh with our group was unforgettable.',
    coverImg: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    likesCount: 58,
    location: 'Leh Ladakh',
    hasReel: true,
  },
  {
    authorName: 'Priya Nair',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    title: 'Backwaters of Kerala',
    content: 'Floating through the serene backwaters on a houseboat was the most peaceful experience of my life.',
    coverImg: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
    likesCount: 42,
    location: 'Alleppey, Kerala',
    hasReel: false,
  },
  {
    authorName: 'Vikram Singh',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    title: 'Ganga Aarti at Varanasi',
    content: 'The evening Ganga Aarti at Dashashwamedh Ghat is a spectacle of fire, chants, and devotion.',
    coverImg: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80',
    likesCount: 67,
    location: 'Varanasi, UP',
    hasReel: true,
  },
  {
    authorName: 'Meera Reddy',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    title: 'Sunrise at Kanyakumari',
    content: 'Where three oceans meet — watching the sunrise paint the sky over the Vivekananda Rock Memorial.',
    coverImg: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
    likesCount: 35,
    location: 'Kanyakumari, TN',
    hasReel: false,
  },
];

let seeded = false;

// Get all stories
router.get('/', async (req, res) => {
  try {
    let stories = await prisma.travelStory.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (stories.length === 0 && !seeded) {
      seeded = true;
      await prisma.travelStory.createMany({ data: SEED_STORIES });
      stories = await prisma.travelStory.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    res.status(200).json({ status: 'success', data: stories });
  } catch (err) {
    console.warn('[Stories] DB error, returning seed data:', err);
    const fallback = SEED_STORIES.map((s, i) => ({ id: `story-${i + 1}`, ...s, createdAt: new Date().toISOString() }));
    res.status(200).json({ status: 'success', data: fallback });
  }
});

// Create new story (customer post — visible to all users)
router.post('/', async (req, res) => {
  const { title, content, coverImg, authorName, authorAvatar, location, hasReel } = req.body;
  try {
    const story = await prisma.travelStory.create({
      data: {
        title: title || 'My Travel Story',
        content: content || '',
        coverImg: coverImg || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
        authorName: authorName || 'Traveler',
        authorAvatar: authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        likesCount: 0,
        location: location || 'India',
        hasReel: Boolean(hasReel),
      },
    });
    res.status(201).json({ status: 'success', data: story });
  } catch (err) {
    console.warn('[Stories] Create error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create story' });
  }
});

// Like a story
router.post('/:id/like', async (req, res) => {
  const { id } = req.params;
  try {
    const story = await prisma.travelStory.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
    });
    res.status(200).json({ status: 'success', data: story });
  } catch (err) {
    console.warn('[Stories] Like error:', err);
    res.status(404).json({ status: 'error', message: 'Story not found' });
  }
});

export default router;

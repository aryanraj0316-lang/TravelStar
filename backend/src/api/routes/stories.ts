import { Router } from 'express';

const router = Router();

// Mock Stories/Blogs store
const stories = [
  {
    id: 'story-1',
    authorName: 'Aarav Sharma',
    authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    title: 'Spiritual Peace in Vrindavan',
    content: 'Experiencing the morning Aarti at Bankey Bihari Temple was truly divine...',
    coverImg: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
    likesCount: 24,
    location: 'Vrindavan, UP',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'story-2',
    authorName: 'Anjali Sharma',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    title: 'Conquering Khardung La Pass',
    content: 'Riding through the cold winds of Ladakh with our group was unforgettable.',
    coverImg: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    likesCount: 58,
    location: 'Leh Ladakh',
    createdAt: new Date().toISOString(),
  },
];

// Get all stories
router.get('/', (req, res) => {
  res.status(200).json({ status: 'success', data: stories });
});

// Create new story
router.post('/', (req, res) => {
  const { title, content, coverImg, authorName, authorAvatar, location } = req.body;
  const newStory = {
    id: `story-${Date.now()}`,
    title,
    content,
    coverImg: coverImg || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
    authorName: authorName || 'Traveler',
    authorAvatar: authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    likesCount: 0,
    location: location || 'India',
    createdAt: new Date().toISOString(),
  };
  stories.unshift(newStory);
  res.status(201).json({ status: 'success', data: newStory });
});

// Like a story
router.post('/:id/like', (req, res) => {
  const { id } = req.params;
  const story = stories.find((s) => s.id === id);
  if (!story) {
    return res.status(404).json({ status: 'error', message: 'Story not found' });
  }
  story.likesCount += 1;
  res.status(200).json({ status: 'success', data: story });
});

export default router;

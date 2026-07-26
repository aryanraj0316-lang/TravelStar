import { Router } from 'express';
import prisma from '../../services/db';

const router = Router();

// Default seed data for trending destinations
const SEED_DESTINATIONS = [
  { name: 'Ladakh', tags: 'Adventure • Mountains', rating: 4.8, image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=400&q=80', rank: 1 },
  { name: 'Andaman', tags: 'Beaches • Relaxation', rating: 4.7, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', rank: 2 },
  { name: 'Goa', tags: 'Nightlife • Beaches', rating: 4.6, image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=400&q=80', rank: 3 },
  { name: 'Kerala', tags: 'Nature • Backwaters', rating: 4.9, image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=400&q=80', rank: 4 },
  { name: 'Manali', tags: 'Snow • Hill Station', rating: 4.8, image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=400&q=80', rank: 5 },
  { name: 'Varanasi', tags: 'Ghats • Ganga River', rating: 4.9, image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80', rank: 6 },
  { name: 'Udaipur', tags: 'Palaces • Romance', rating: 4.9, image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=400&q=80', rank: 7 },
  { name: 'Darjeeling', tags: 'Tea Gardens • Views', rating: 4.6, image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80', rank: 8 },
];

let seeded = false;

// Get all destinations
router.get('/', async (req, res) => {
  try {
    let destinations = await prisma.destination.findMany({
      orderBy: { rank: 'asc' },
    });

    // Auto-seed on first call
    if (destinations.length === 0 && !seeded) {
      seeded = true;
      await prisma.destination.createMany({ data: SEED_DESTINATIONS });
      destinations = await prisma.destination.findMany({
        orderBy: { rank: 'asc' },
      });
    }

    res.status(200).json({ status: 'success', data: destinations });
  } catch (err) {
    console.warn('[Destinations] DB error, returning seed data:', err);
    // Fallback to seed data if DB fails
    const fallback = SEED_DESTINATIONS.map((d, i) => ({ id: `dest-${i + 1}`, ...d, featured: false, createdAt: new Date().toISOString() }));
    res.status(200).json({ status: 'success', data: fallback });
  }
});

// Create a new destination (admin or customer post — visible to all)
router.post('/', async (req, res) => {
  const { name, tags, rating, image, rank } = req.body;
  try {
    const destination = await prisma.destination.create({
      data: {
        name: name || 'New Destination',
        tags: tags || 'Travel • Explore',
        rating: parseFloat(rating) || 4.5,
        image: image || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
        rank: parseInt(rank) || 0,
      },
    });
    res.status(201).json({ status: 'success', data: destination });
  } catch (err) {
    console.warn('[Destinations] Create error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create destination' });
  }
});

export default router;

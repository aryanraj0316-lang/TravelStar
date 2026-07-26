import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { RecommendationService } from '../../services/recommendation';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

const getUserIdFromReq = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      return decoded.id || decoded.userId;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Persistent Mock Trips Data Store
const trips: any[] = [];

// List Trips (with optional query filters)
router.get('/', async (req, res) => {
  const { category, search, maxBudget } = req.query;
  try {
    let dbTrips = await prisma.trip.findMany({
      include: {
        creator: {
          include: { profile: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Map database trips to frontend shape
    const mapped = dbTrips.map((t) => {
      const creatorName = t.creator?.profile
        ? `${t.creator.profile.firstName} ${t.creator.profile.lastName} (${t.creator.role === 'GUIDE' ? 'Guide' : 'Organizer'})`
        : 'Aarav Sharma (Organizer)';
      
      // Determine travelStyle and category
      let travelStyle = 'ADVENTURE';
      let categoryVal = 'Adventure';
      if (t.name.toLowerCase().includes('spiritual') || t.name.toLowerCase().includes('vrindavan') || t.name.toLowerCase().includes('varanasi')) {
        travelStyle = 'RELIGIOUS';
        categoryVal = 'Religious';
      } else if (t.name.toLowerCase().includes('kerala') || t.name.toLowerCase().includes('backwaters') || t.name.toLowerCase().includes('nature')) {
        travelStyle = 'NATURE';
        categoryVal = 'Nature';
      } else if (t.name.toLowerCase().includes('heritage') || t.name.toLowerCase().includes('taj mahal')) {
        travelStyle = 'HERITAGE';
        categoryVal = 'Heritage';
      }

      return {
        id: t.id,
        name: t.name,
        creator: creatorName,
        creatorId: t.creatorId,
        cities: t.cities,
        startDate: t.startDate.toISOString().split('T')[0],
        endDate: t.endDate.toISOString().split('T')[0],
        budget: t.budget,
        availableSeats: t.availableSeats,
        totalSeats: t.totalSeats,
        meetingPoint: t.meetingPoint,
        guideIncluded: t.guideIncluded,
        foodIncluded: t.foodIncluded,
        privacy: t.privacy,
        membersCount: t.totalSeats - t.availableSeats,
        coverImage: t.coverImage || (t.name.toLowerCase().includes('vrindavan') ? 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80' :
                    t.name.toLowerCase().includes('ladakh') ? 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80' :
                    t.name.toLowerCase().includes('kerala') ? 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80' :
                    t.name.toLowerCase().includes('taj mahal') ? 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80' :
                    t.name.toLowerCase().includes('golden triangle') ? 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80' :
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80'),
        category: t.category || categoryVal,
        languages: t.languages,
        travelStyle: travelStyle,
      };
    });

    let filtered = [...mapped];

    if (category && typeof category === 'string' && category !== 'All') {
      filtered = filtered.filter((t) => t.category?.toLowerCase() === category.toLowerCase());
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.cities.some((c) => c.toLowerCase().includes(q)) ||
          t.creator.toLowerCase().includes(q)
      );
    }

    if (maxBudget) {
      const limit = parseFloat(maxBudget as string);
      if (!isNaN(limit)) {
        filtered = filtered.filter((t) => t.budget <= limit);
      }
    }

    return res.status(200).json({ status: 'success', data: filtered });
  } catch (err) {
    console.warn('[Trips] DB error, returning memory trips:', err);
    let filtered = [...trips];

    if (category && typeof category === 'string' && category !== 'All') {
      filtered = filtered.filter((t) => t.category?.toLowerCase() === category.toLowerCase());
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.cities.some((c: string) => c.toLowerCase().includes(q)) ||
          t.creator.toLowerCase().includes(q)
      );
    }

    if (maxBudget) {
      const limit = parseFloat(maxBudget as string);
      if (!isNaN(limit)) {
        filtered = filtered.filter((t) => t.budget <= limit);
      }
    }
    return res.status(200).json({ status: 'success', data: filtered });
  }
});

// Get Trip by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const t = await prisma.trip.findUnique({
      where: { id },
      include: {
        creator: {
          include: { profile: true }
        }
      }
    });
    if (!t) {
      const fallback = trips.find((item) => item.id === id);
      if (fallback) {
        return res.status(200).json({ status: 'success', data: fallback });
      }
      return res.status(404).json({ status: 'error', message: 'Trip not found' });
    }

    const creatorName = t.creator?.profile
      ? `${t.creator.profile.firstName} ${t.creator.profile.lastName} (${t.creator.role === 'GUIDE' ? 'Guide' : 'Organizer'})`
      : 'Aarav Sharma (Organizer)';

    let travelStyle = 'ADVENTURE';
    let categoryVal = 'Adventure';
    if (t.name.toLowerCase().includes('spiritual') || t.name.toLowerCase().includes('vrindavan') || t.name.toLowerCase().includes('varanasi')) {
      travelStyle = 'RELIGIOUS';
      categoryVal = 'Religious';
    } else if (t.name.toLowerCase().includes('kerala') || t.name.toLowerCase().includes('backwaters') || t.name.toLowerCase().includes('nature')) {
      travelStyle = 'NATURE';
      categoryVal = 'Nature';
    } else if (t.name.toLowerCase().includes('heritage') || t.name.toLowerCase().includes('taj mahal')) {
      travelStyle = 'HERITAGE';
      categoryVal = 'Heritage';
    }

    const mapped = {
      id: t.id,
      name: t.name,
      creator: creatorName,
      creatorId: t.creatorId,
      cities: t.cities,
      startDate: t.startDate.toISOString().split('T')[0],
      endDate: t.endDate.toISOString().split('T')[0],
      budget: t.budget,
      availableSeats: t.availableSeats,
      totalSeats: t.totalSeats,
      meetingPoint: t.meetingPoint,
      guideIncluded: t.guideIncluded,
      foodIncluded: t.foodIncluded,
      privacy: t.privacy,
      membersCount: t.totalSeats - t.availableSeats,
      coverImage: t.coverImage || (t.name.toLowerCase().includes('vrindavan') ? 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80' :
                  t.name.toLowerCase().includes('ladakh') ? 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80' :
                  t.name.toLowerCase().includes('kerala') ? 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80' :
                  t.name.toLowerCase().includes('taj mahal') ? 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80' :
                  t.name.toLowerCase().includes('golden triangle') ? 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80' :
                  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80'),
      category: t.category || categoryVal,
      languages: t.languages,
      travelStyle: travelStyle,
    };
    return res.status(200).json({ status: 'success', data: mapped });
  } catch (e) {
    const fallback = trips.find((item) => item.id === id);
    if (fallback) {
      return res.status(200).json({ status: 'success', data: fallback });
    }
    return res.status(404).json({ status: 'error', message: 'Trip not found' });
  }
});

// Create Trip
router.post('/', async (req, res) => {
  const {
    id,
    name,
    creator,
    creatorId,
    cities,
    startDate,
    endDate,
    budget,
    totalSeats,
    meetingPoint,
    guideIncluded,
    foodIncluded,
    privacy,
    coverImage,
    category,
    coordinates,
  } = req.body;

  try {
    // Get organizer user dynamically via creatorId or token
    let user;
    const tokenUserId = getUserIdFromReq(req);
    const targetUserId = tokenUserId || creatorId;
    if (targetUserId) {
      user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { profile: true }
      });
    }

    if (!user) {
      user = await prisma.user.findFirst({
        include: { profile: true }
      });
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'aarav@example.com',
          role: 'ORGANIZER',
          profile: {
            create: {
              firstName: 'Aarav',
              lastName: 'Sharma',
              avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            }
          }
        },
        include: { profile: true }
      });
    }

    // Create record in Neon PostgreSQL Database
    const newTrip = await prisma.trip.create({
      data: {
        id: id || undefined,
        creatorId: user.id,
        name: name || 'Custom Indian Expedition',
        description: 'Custom travel route created via TravelConnect app.',
        cities: cities && cities.length ? cities : ['Delhi', 'Agra'],
        startDate: new Date(startDate || '2026-09-01'),
        endDate: new Date(endDate || '2026-09-05'),
        durationDays: 5,
        budget: parseFloat(budget) || 5000,
        availableSeats: parseInt(totalSeats) || 10,
        totalSeats: parseInt(totalSeats) || 10,
        meetingPoint: meetingPoint || 'Central Station',
        guideIncluded: Boolean(guideIncluded),
        foodIncluded: Boolean(foodIncluded),
        privacy: (privacy || 'PUBLIC') as any,
        languages: ['Hindi', 'English'],
        coverImage: coverImage || null,
        category: category || null,
      }
    });

    const mappedTrip = {
      id: newTrip.id,
      name: newTrip.name,
      creator: user.profile ? `${user.profile.firstName} ${user.profile.lastName} (Organizer)` : `${user.email} (Organizer)`,
      creatorId: user.id,
      cities: newTrip.cities,
      startDate: newTrip.startDate.toISOString().split('T')[0],
      endDate: newTrip.endDate.toISOString().split('T')[0],
      budget: newTrip.budget,
      availableSeats: newTrip.availableSeats,
      totalSeats: newTrip.totalSeats,
      meetingPoint: newTrip.meetingPoint,
      guideIncluded: newTrip.guideIncluded,
      foodIncluded: newTrip.foodIncluded,
      privacy: newTrip.privacy,
      membersCount: 1,
      coverImage: newTrip.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
      category: newTrip.category || 'Adventure',
      languages: ['Hindi', 'English'],
      travelStyle: 'ADVENTURE',
      coordinates: coordinates || [],
    };

    trips.unshift(mappedTrip);
    return res.status(201).json({ status: 'success', data: mappedTrip });
  } catch (err) {
    console.warn('[Postgres DB Warn] Trip creation fallback active:', err);
    const fallbackTrip = {
      id: id || `trip-${Date.now()}`,
      name: name || 'Custom Indian Expedition',
      creator: creator || 'Aarav Sharma (Organizer)',
      cities: cities && cities.length ? cities : ['Delhi', 'Agra'],
      startDate: startDate || '2026-09-01',
      endDate: endDate || '2026-09-05',
      budget: parseFloat(budget) || 5000,
      availableSeats: parseInt(totalSeats) || 10,
      totalSeats: parseInt(totalSeats) || 10,
      meetingPoint: meetingPoint || 'Central Station',
      guideIncluded: Boolean(guideIncluded),
      foodIncluded: Boolean(foodIncluded),
      privacy: privacy || 'PUBLIC',
      membersCount: 1,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
      category: category || 'Adventure',
      languages: ['Hindi', 'English'],
      travelStyle: 'ADVENTURE',
      coordinates: coordinates || [],
    };
    trips.unshift(fallbackTrip);
    return res.status(201).json({ status: 'success', data: fallbackTrip });
  }
});

// Join Trip
router.post('/:id/join', async (req, res) => {
  const { id } = req.params;
  let trip = trips.find((t) => t.id === id);

  if (!trip) {
    try {
      const dbTrip = await prisma.trip.findUnique({
        where: { id }
      });
      if (dbTrip) {
        if (dbTrip.availableSeats > 0) {
          const updatedDbTrip = await prisma.trip.update({
            where: { id },
            data: {
              availableSeats: dbTrip.availableSeats - 1
            }
          });
          trip = {
            id: updatedDbTrip.id,
            name: updatedDbTrip.name,
            creator: 'Aarav Sharma (Organizer)',
            cities: updatedDbTrip.cities,
            startDate: updatedDbTrip.startDate.toISOString().split('T')[0],
            endDate: updatedDbTrip.endDate.toISOString().split('T')[0],
            budget: updatedDbTrip.budget,
            availableSeats: updatedDbTrip.availableSeats,
            totalSeats: updatedDbTrip.totalSeats,
            meetingPoint: updatedDbTrip.meetingPoint,
            guideIncluded: updatedDbTrip.guideIncluded,
            foodIncluded: updatedDbTrip.foodIncluded,
            privacy: updatedDbTrip.privacy,
            membersCount: updatedDbTrip.totalSeats - updatedDbTrip.availableSeats,
            coverImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
            category: 'Adventure',
            languages: ['Hindi', 'English'],
            travelStyle: 'ADVENTURE',
          };
          trips.push(trip);
        } else {
          return res.status(400).json({ status: 'error', message: 'No available seats on this trip' });
        }
      }
    } catch (e) {
      console.warn('[Postgres DB Warn] Database lookup error during join:', e);
    }
  }

  if (!trip) {
    return res.status(404).json({ status: 'error', message: 'Trip not found' });
  }

  if (trip.availableSeats <= 0) {
    return res.status(400).json({ status: 'error', message: 'No available seats on this trip' });
  }

  trip.availableSeats -= 1;
  trip.membersCount += 1;

  res.status(200).json({ status: 'success', data: trip, message: 'Successfully joined trip' });
});

// AI Recommendation generator
router.post('/recommendations', (req, res) => {
  const { currentLocation, interests, budgetLimit, languages, travelStyle } = req.body;

  const userPrefs = {
    currentLocation: currentLocation || 'Delhi',
    interests: interests || [],
    budgetLimit: parseFloat(budgetLimit) || 30000,
    languages: languages || ['Hindi'],
    travelStyle: travelStyle || 'RELIGIOUS',
  };

  const results = RecommendationService.getRecommendations(userPrefs, trips);
  res.status(200).json({ status: 'success', data: results });
});

// Midway Join (Family Connect segment calculation)
router.post('/:id/midway-join', (req, res) => {
  const { id } = req.params;
  const { fromCity, toCity } = req.body;

  const trip = trips.find((t) => t.id === id);
  if (!trip) {
    return res.status(404).json({ status: 'error', message: 'Trip not found' });
  }

  const fromIndex = trip.cities.indexOf(fromCity);
  const toIndex = trip.cities.indexOf(toCity);

  if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid midway segments selected for this trip route',
    });
  }

  const totalSegments = trip.cities.length - 1;
  const requestedSegments = toIndex - fromIndex;
  const adjustedPrice = Math.round((trip.budget / totalSegments) * requestedSegments);

  res.status(200).json({
    status: 'success',
    data: {
      tripId: id,
      fromCity,
      toCity,
      fullPrice: trip.budget,
      adjustedPrice,
      segmentsTraversed: trip.cities.slice(fromIndex, toIndex + 1),
    },
  });
});

// Get Nearby Places / Trips
router.get('/nearby', (req, res) => {
  const nearbyPlaces = [
    {
      id: 'place-1',
      name: 'Sultanpur Bird Sanctuary & Lake',
      category: 'Nature & Wildlife',
      distanceKm: 42,
      driveTime: '1 hr 05 mins',
      pricePerHead: 1800,
      priceDiffText: '✨ SASTA TRIP (Minimal Expense - Save ₹3,100)',
      isCheapest: true,
      rating: 4.6,
      reviewsCount: 1240,
      imageUrl: 'https://images.unsplash.com/photo-1511497584788-876761c119ef?w=800&q=80',
      shortDesc: 'Serene wetland lake sanctuary with migratory birds & peaceful walking trails.',
      transportCost: 600,
      stayMealCost: 1000,
      entryCost: 200,
    },
    {
      id: 'place-2',
      name: 'Surajkund Heritage Lake & Asola Reserve',
      category: 'Heritage & Nature',
      distanceKm: 24,
      driveTime: '35 mins',
      pricePerHead: 2200,
      priceDiffText: '📍 NEAREST LOCATION (Only 24 km away)',
      isNearest: true,
      rating: 4.5,
      reviewsCount: 890,
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
      shortDesc: 'Ancient 10th-century amphitheater reservoir surrounded by lush green hills.',
      transportCost: 500,
      stayMealCost: 1500,
      entryCost: 200,
    },
    {
      id: 'place-3',
      name: 'Agra Taj Mahal & Agra Fort',
      category: 'World Wonder Heritage',
      distanceKm: 210,
      driveTime: '3 hrs 15 mins (Expressway)',
      pricePerHead: 4900,
      priceDiffText: '👑 BEST RATED #1 DESTINATION (4.9★)',
      isBestRated: true,
      rating: 4.9,
      reviewsCount: 4820,
      imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
      shortDesc: 'Iconic marble monument of eternal love & Mughal grand citadel fort.',
      transportCost: 1800,
      stayMealCost: 2500,
      entryCost: 600,
    },
    {
      id: 'place-4',
      name: 'Neemrana Fort Palace & Zipline',
      category: 'Royal Heritage & Adventure',
      distanceKm: 122,
      driveTime: '2 hrs 10 mins',
      pricePerHead: 3800,
      priceDiffText: '+₹2,000 vs Sasta Trip',
      rating: 4.7,
      reviewsCount: 2150,
      imageUrl: 'https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&q=80',
      shortDesc: '15th-century cliffside palace with flying-fox zipline over Rajasthan hills.',
      transportCost: 1200,
      stayMealCost: 2100,
      entryCost: 500,
    },
    {
      id: 'place-5',
      name: 'Rishikesh Ganga Ghats & Rafting',
      category: 'Adventure & Yoga Capital',
      distanceKm: 240,
      driveTime: '4 hrs 20 mins',
      pricePerHead: 3400,
      priceDiffText: '+₹1,600 vs Sasta Trip',
      rating: 4.8,
      reviewsCount: 3910,
      imageUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
      shortDesc: 'White-water river rafting on River Ganges & evening divine Ganga Aarti.',
      transportCost: 1400,
      stayMealCost: 1600,
      entryCost: 400,
    },
  ];
  res.status(200).json({ status: 'success', data: nearbyPlaces });
});

export default router;

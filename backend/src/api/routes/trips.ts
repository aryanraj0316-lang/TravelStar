import { Router } from 'express';
import { RecommendationService } from '../../services/recommendation';
import prisma from '../../services/db';

const router = Router();

// Persistent Mock Trips Data Store
const trips = [
  {
    id: 'trip-1',
    name: 'Ranchi to Vrindavan Spiritual Journey',
    creator: 'Vikram Singh (Organizer)',
    cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    startDate: '2026-08-12',
    endDate: '2026-08-17',
    budget: 8500,
    availableSeats: 5,
    totalSeats: 15,
    meetingPoint: 'Ranchi Junction Platform 1',
    guideIncluded: true,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 10,
    languages: ['Hindi', 'English'],
    travelStyle: 'RELIGIOUS',
    category: 'Religious',
  },
  {
    id: 'trip-2',
    name: 'Leh Ladakh Bike Expedition',
    creator: 'Aditya Sen',
    cities: ['Manali', 'Sarchu', 'Leh', 'Nubra Valley', 'Pangong Tso'],
    startDate: '2026-09-05',
    endDate: '2026-09-14',
    budget: 28000,
    availableSeats: 4,
    totalSeats: 8,
    meetingPoint: 'Manali Mall Road',
    guideIncluded: true,
    foodIncluded: false,
    privacy: 'PUBLIC',
    membersCount: 4,
    languages: ['English', 'Hindi', 'Tibetan'],
    travelStyle: 'ADVENTURE',
    category: 'Adventure',
  },
  {
    id: 'trip-3',
    name: 'Kerala Backwaters & Hills',
    creator: 'Priya Nair',
    cities: ['Kochi', 'Munnar', 'Alleppey'],
    startDate: '2026-08-25',
    endDate: '2026-08-30',
    budget: 15000,
    availableSeats: 6,
    totalSeats: 10,
    meetingPoint: 'Kochi Airport Terminal 1',
    guideIncluded: false,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 4,
    languages: ['English', 'Malayalam'],
    travelStyle: 'NATURE',
    category: 'Nature',
  },
  {
    id: 'creation-1',
    name: 'Taj Mahal Heritage Getaway',
    creator: 'Aarav Sharma (Organizer)',
    cities: ['Delhi', 'Agra', 'Fatehpur Sikri'],
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    budget: 6500,
    availableSeats: 12,
    totalSeats: 15,
    meetingPoint: 'Delhi Aerocity Metro Stn',
    guideIncluded: true,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 3,
    coverImage: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
    category: 'Heritage',
    languages: ['Hindi', 'English'],
    travelStyle: 'HERITAGE',
  },
  {
    id: 'creation-2',
    name: 'Golden Triangle Scenic Tour',
    creator: 'Aarav Sharma (Organizer)',
    cities: ['Delhi', 'Agra', 'Jaipur'],
    startDate: '2026-08-20',
    endDate: '2026-08-25',
    budget: 9800,
    availableSeats: 8,
    totalSeats: 12,
    meetingPoint: 'New Delhi Rly Station PF 1',
    guideIncluded: true,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 4,
    coverImage: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    category: 'Adventure',
    languages: ['Hindi', 'English'],
    travelStyle: 'ADVENTURE',
  },
  {
    id: 'bt-2',
    name: 'Varanasi Spiritual Ghats & Sarnath Heritage Tour',
    creator: 'Anjali Sharma (Local Guide)',
    cities: ['Varanasi', 'Sarnath'],
    startDate: '2026-08-18',
    endDate: '2026-08-20',
    budget: 6500,
    availableSeats: 6,
    totalSeats: 12,
    meetingPoint: 'Dashashwamedh Ghat Varanasi',
    guideIncluded: true,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 6,
    languages: ['Hindi', 'English'],
    travelStyle: 'RELIGIOUS',
    category: 'Religious',
  },
  {
    id: 'bt-4',
    name: 'Kashmir Backpacking (Srinagar, Gulmarg & Pahalgam)',
    creator: 'Aarav Sharma (Solo Traveler/User)',
    cities: ['Srinagar', 'Gulmarg', 'Pahalgam'],
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    budget: 14500,
    availableSeats: 3,
    totalSeats: 8,
    meetingPoint: 'Srinagar Airport Gate 1',
    guideIncluded: false,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 5,
    languages: ['Hindi', 'English', 'Kashmiri'],
    travelStyle: 'ADVENTURE',
    category: 'Adventure',
  },
  {
    id: 'bt-5',
    name: 'Goa Beach Hopping & Dudhsagar Waterfalls Road Trip',
    creator: 'Priya & Friends (Tourist Group)',
    cities: ['North Goa', 'South Goa', 'Dudhsagar'],
    startDate: '2026-08-28',
    endDate: '2026-09-01',
    budget: 9800,
    availableSeats: 2,
    totalSeats: 8,
    meetingPoint: 'Mapusa Bus Terminal Goa',
    guideIncluded: false,
    foodIncluded: true,
    privacy: 'PUBLIC',
    membersCount: 6,
    languages: ['English', 'Hindi', 'Konkani'],
    travelStyle: 'NATURE',
    category: 'Nature',
  },
];

// List Trips (with optional query filters)
router.get('/', (req, res) => {
  const { category, search, maxBudget } = req.query;
  let filtered = [...trips];

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

  res.status(200).json({ status: 'success', data: filtered });
});

// Get Trip by ID
router.get('/:id', (req, res) => {
  const trip = trips.find((t) => t.id === req.params.id);
  if (!trip) {
    return res.status(404).json({ status: 'error', message: 'Trip not found' });
  }
  res.status(200).json({ status: 'success', data: trip });
});

// Create Trip
router.post('/', async (req, res) => {
  const {
    id,
    name,
    creator,
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
    // Get or create organizer user (e.g. active profile user or fallback)
    let user = await prisma.user.findFirst({
      include: { profile: true }
    });

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
      }
    });

    const mappedTrip = {
      id: newTrip.id,
      name: newTrip.name,
      creator: `${user.profile?.firstName} ${user.profile?.lastName} (Organizer)`,
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
      coverImage: coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
      category: category || 'Adventure',
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

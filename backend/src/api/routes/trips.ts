import { Router } from 'express';
import { RecommendationService } from '../../services/recommendation';

const router = Router();

// Mock Trips data
const trips = [
  {
    id: 'trip-1',
    name: 'Ranchi to Vrindavan Spiritual Journey',
    cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    budget: 8500,
    languages: ['Hindi', 'English'],
    travelStyle: 'RELIGIOUS',
    availableSeats: 5,
    totalSeats: 15,
  },
  {
    id: 'trip-2',
    name: 'Ladakh Adventure Tour',
    cities: ['Manali', 'Sarchu', 'Leh'],
    budget: 22000,
    languages: ['English', 'Tibetan'],
    travelStyle: 'ADVENTURE',
    availableSeats: 3,
    totalSeats: 10,
  },
];

// List Trips
router.get('/', (req, res) => {
  res.status(200).json({ status: 'success', data: trips });
});

// Create Trip
router.post('/', (req, res) => {
  const { name, cities, budget, languages, travelStyle, totalSeats } = req.body;
  const newTrip = {
    id: `trip-${Date.now()}`,
    name,
    cities: cities || [],
    budget: parseFloat(budget) || 0,
    languages: languages || ['English'],
    travelStyle: travelStyle || 'SOLO',
    availableSeats: parseInt(totalSeats) || 10,
    totalSeats: parseInt(totalSeats) || 10,
  };
  trips.push(newTrip);
  res.status(201).json({ status: 'success', data: newTrip });
});

// AI Recommendation recommendations
router.post('/recommendations', (req, res) => {
  const { currentLocation, interests, budgetLimit, languages, travelStyle } = req.body;
  
  const userPrefs = {
    currentLocation: currentLocation || 'Delhi',
    interests: interests || [],
    budgetLimit: parseFloat(budgetLimit) || 15000,
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

export default router;

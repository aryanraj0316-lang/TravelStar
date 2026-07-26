import { Router } from 'express';
import prisma from '../../services/db';

const router = Router();

// Default seed data for weather locations
const SEED_WEATHER = [
  { name: 'New Delhi', place: 'India Gate', temp: '32°C', condition: 'Partly Sunny', aqi: 'Good AQI • 42', humidity: '48%', image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80' },
  { name: 'Agra', place: 'Taj Mahal', temp: '34°C', condition: 'Sunny & Clear', aqi: 'Moderate AQI • 58', humidity: '42%', image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=80' },
  { name: 'Jaipur', place: 'Hawa Mahal', temp: '35°C', condition: 'Warm & Sunny', aqi: 'Moderate AQI • 65', humidity: '35%', image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80' },
  { name: 'Srinagar', place: 'Dal Lake', temp: '21°C', condition: 'Pleasant Breeze', aqi: 'Excellent AQI • 18', humidity: '60%', image: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=500&q=80' },
  { name: 'Varanasi', place: 'Kashi Ghats', temp: '30°C', condition: 'Clear Sky', aqi: 'Good AQI • 45', humidity: '52%', image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80' },
  { name: 'Munnar', place: 'Tea Gardens', temp: '22°C', condition: 'Mist & Clouds', aqi: 'Pure AQI • 12', humidity: '75%', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&q=80' },
  { name: 'Mumbai', place: 'Gateway of India', temp: '29°C', condition: 'Sea Breeze', aqi: 'Moderate AQI • 55', humidity: '70%', image: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=500&q=80' },
  { name: 'Leh-Ladakh', place: 'Pangong Tso', temp: '14°C', condition: 'Chilly & Sunny', aqi: 'Pure AQI • 10', humidity: '25%', image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80' },
  { name: 'Goa', place: 'Baga Beach', temp: '31°C', condition: 'Tropical Sun', aqi: 'Good AQI • 35', humidity: '68%', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80' },
  { name: 'Shimla', place: 'The Ridge', temp: '18°C', condition: 'Cool Mountain Air', aqi: 'Excellent AQI • 15', humidity: '55%', image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=500&q=80' },
  { name: 'Rishikesh', place: 'Laxman Jhula', temp: '26°C', condition: 'Pleasant & Calm', aqi: 'Good AQI • 28', humidity: '50%', image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=500&q=80' },
  { name: 'Udaipur', place: 'Lake Pichola', temp: '33°C', condition: 'Sunny Horizon', aqi: 'Moderate AQI • 48', humidity: '38%', image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=500&q=80' },
];

let seeded = false;

// Get all weather locations
router.get('/', async (req, res) => {
  try {
    let locations = await prisma.weatherLocation.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (locations.length === 0 && !seeded) {
      seeded = true;
      await prisma.weatherLocation.createMany({ data: SEED_WEATHER });
      locations = await prisma.weatherLocation.findMany({
        orderBy: { createdAt: 'asc' },
      });
    }

    res.status(200).json({ status: 'success', data: locations });
  } catch (err) {
    console.warn('[Weather] DB error, returning seed data:', err);
    const fallback = SEED_WEATHER.map((w, i) => ({ id: `weather-${i + 1}`, ...w, createdAt: new Date().toISOString() }));
    res.status(200).json({ status: 'success', data: fallback });
  }
});

export default router;

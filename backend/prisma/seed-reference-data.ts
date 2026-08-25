import { PrismaClient, AlertSeverity, AlertCategory, MonsoonSeverity } from '@prisma/client';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

/**
 * Idempotent reference-data seeding, run explicitly and separately from the
 * destructive demo-data seed (prisma/seed.ts). This used to happen
 * implicitly inside each resource's GET handler — the first request to hit
 * an empty table would seed it — which raced under concurrent requests (two
 * simultaneous first-loads both see an empty table and both insert, since
 * createMany was never called with skipDuplicates) and duplicated rows
 * across every pod in a multi-instance deployment. See
 * docs/REMEDIATION.md §4.9.
 *
 * Safe to run any number of times: each table is only seeded if it is
 * currently empty, so it will never duplicate rows or overwrite content an
 * admin has since created or edited through the app.
 *
 * Run after `prisma migrate deploy` on a fresh environment:
 *   npm run seed:reference
 */

const SEED_ALERTS: {
  severity: AlertSeverity;
  title: string;
  category: AlertCategory;
  location: string;
  time: string;
  desc: string;
  affectedRoute: string;
  precautions: string[];
  image: string;
}[] = [
  {
    severity: 'CRITICAL',
    title: 'Monsoon Warning (Ladakh Routes)',
    category: 'FLOOD_RAIN',
    location: 'Ladakh Corridor (Kargil-Leh)',
    time: '5 mins ago',
    desc: 'Heavy monsoon rain warning along Ladakh routes. Slow down and avoid night transit due to flash flood risks.',
    affectedRoute: 'Srinagar ➔ Kargil ➔ Leh Highway',
    precautions: ['Avoid driving after sunset; visibility drops drastically.', 'Check with local checkposts before crossing Zoji La.', 'Keep extra emergency fuel and dry rations.', 'Stay away from dry stream beds (nullahs) which can flood instantly.'],
    image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=600&q=80',
  },
  {
    severity: 'CRITICAL',
    title: 'Landslide Warning near Shimla',
    category: 'LANDSLIDE',
    location: 'Shimla-Manali Highway (NH-5)',
    time: '14 mins ago',
    desc: 'Active landslide warnings and rockfalls reported near Koti Tunnel. Traffic temporarily suspended.',
    affectedRoute: 'Chandigarh ➔ Shimla ➔ Manali Highway',
    precautions: ['Use the recommended bypass route via Solan if traveling to Shimla.', 'Do not park vehicles near steep rock walls or loose soil slopes.', 'Monitor updates from Himachal Pradesh Traffic Police.', 'Keep windows slightly open to hear falling stone sounds.'],
    image: 'https://imgs.search.brave.com/DM-N8jr-m9mdKTxRifft8Pa0MdawZTa9dDrcYTZPTSM/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tYWdh/cnRpY2xlcy5tYWd6/dGVyLmNvbS9hcnRp/Y2xlcy80OTcyLzMz/Nzg3Ni81ZDM2YjZi/NmYxMDMzL1JhaW5m/YWxsLUxhbmRzbGlk/ZS1OYXR1cmFsLURp/c2FzdGVyLmpwZw',
  },
  {
    severity: 'CRITICAL',
    title: 'Flash Flood Advisory in Rishikesh',
    category: 'FLOOD_RAIN',
    location: 'Ganges River Valley, Rishikesh',
    time: '28 mins ago',
    desc: 'River water levels rising rapidly near Lakshman Jhula. All white water rafting and river bank camping suspended for 48 hours.',
    affectedRoute: 'Rishikesh ➔ Devprayag corridor (NH-7)',
    precautions: ['Relocate from low-lying camping sites immediately.', 'Rafting is strictly illegal until the red alert is lifted.', 'Follow signs and instructions from local SDRF personnel.', 'Secure dry bags for important documents and medicines.'],
    image: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?w=600&q=80',
  },
  {
    severity: 'WARNING',
    title: 'Cloudburst Warning (North Sikkim)',
    category: 'CLOUDBURST',
    location: 'Lachung & Lachen Valleys',
    time: '1 hour ago',
    desc: 'Met office predicts high risk of localized cloudbursts. Sudden flash floods and mudslides expected. Travel restricted.',
    affectedRoute: 'Gangtok ➔ Mangan ➔ Lachung Corridor',
    precautions: ['Postpone any travel plans to North Sikkim for the next 24 hours.', 'Stay inside concrete structures; avoid lightweight shelters.', 'Keep local disaster control room helpline numbers active.', 'Coordinate with your tour guide for safe zone assembly.'],
    image: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600&q=80',
  },
  {
    severity: 'WARNING',
    title: 'Heavy Rainfall & Waterlogging',
    category: 'FLOOD_RAIN',
    location: 'Mumbai-Pune Expressway',
    time: '2 hours ago',
    desc: 'Heavy continuous rain causing water pooling at low points of the expressway. 30-40 min delays expected.',
    affectedRoute: 'Mumbai ➔ Pune Expressway (NH-48)',
    precautions: ['Maintain double the normal stopping distance from the vehicle ahead.', 'Avoid hydroplaning by keeping speeds under 60 km/h.', 'Check wiper health before entering the ghat sections.', 'Use fog lights and hazard lights if visibility drops below 50m.'],
    image: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=600&q=80',
  },
  {
    severity: 'ADVISORY',
    title: 'Traffic Gridlock near Kalka',
    category: 'TRAFFIC_RUSH',
    location: 'Kalka-Shimla Toy Train Bypass',
    time: '3 hours ago',
    desc: 'Weekend rush and slippery road conditions have caused a 6km traffic queue. Slow crawling speed advised.',
    affectedRoute: 'Kalka ➔ Solan highway stretch',
    precautions: ['Expect an additional 1.5 hours travel time.', 'Keep vehicle AC in internal circulation mode to avoid exhaust fumes.', 'Carry adequate drinking water and snacks.', 'Do not attempt overtaking on single lane curves.'],
    image: 'https://imgs.search.brave.com/UkOkctK_kmgYf3qV4eUoIEUSbUHoIwW5wNu2n4R0Rog/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS50ZWxhbmdhbmF0/b2RheS5jb20vd3At/Y29udGVudC91cGxv/YWRzLzIwMjYvMDYv/U2hpbWxhLWhpbGwt/c3RhdGlvbi5qcGc',
  },
];

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

const SEED_WEATHER = [
  { name: 'New Delhi', place: 'India Gate', temp: '32°C', condition: 'Partly Sunny', aqi: 'Good AQI • 42', humidity: '48%', image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80', latitude: 28.6139, longitude: 77.2090 },
  { name: 'Agra', place: 'Taj Mahal', temp: '34°C', condition: 'Sunny & Clear', aqi: 'Moderate AQI • 58', humidity: '42%', image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=80', latitude: 27.1767, longitude: 78.0081 },
  { name: 'Jaipur', place: 'Hawa Mahal', temp: '35°C', condition: 'Warm & Sunny', aqi: 'Moderate AQI • 65', humidity: '35%', image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Srinagar', place: 'Dal Lake', temp: '21°C', condition: 'Pleasant Breeze', aqi: 'Excellent AQI • 18', humidity: '60%', image: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=500&q=80', latitude: 34.0837, longitude: 74.7973 },
  { name: 'Varanasi', place: 'Kashi Ghats', temp: '30°C', condition: 'Clear Sky', aqi: 'Good AQI • 45', humidity: '52%', image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80', latitude: 25.3176, longitude: 83.0168 },
  { name: 'Munnar', place: 'Tea Gardens', temp: '22°C', condition: 'Mist & Clouds', aqi: 'Pure AQI • 12', humidity: '75%', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&q=80', latitude: 10.0889, longitude: 77.0595 },
  { name: 'Mumbai', place: 'Gateway of India', temp: '29°C', condition: 'Sea Breeze', aqi: 'Moderate AQI • 55', humidity: '70%', image: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=500&q=80', latitude: 19.0760, longitude: 72.8777 },
  { name: 'Leh-Ladakh', place: 'Pangong Tso', temp: '14°C', condition: 'Chilly & Sunny', aqi: 'Pure AQI • 10', humidity: '25%', image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80', latitude: 34.1526, longitude: 77.5771 },
  { name: 'Goa', place: 'Baga Beach', temp: '31°C', condition: 'Tropical Sun', aqi: 'Good AQI • 35', humidity: '68%', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80', latitude: 15.2993, longitude: 74.1240 },
  { name: 'Shimla', place: 'The Ridge', temp: '18°C', condition: 'Cool Mountain Air', aqi: 'Excellent AQI • 15', humidity: '55%', image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=500&q=80', latitude: 31.1048, longitude: 77.1734 },
  { name: 'Rishikesh', place: 'Laxman Jhula', temp: '26°C', condition: 'Pleasant & Calm', aqi: 'Good AQI • 28', humidity: '50%', image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=500&q=80', latitude: 30.0869, longitude: 78.2676 },
  { name: 'Udaipur', place: 'Lake Pichola', temp: '33°C', condition: 'Sunny Horizon', aqi: 'Moderate AQI • 48', humidity: '38%', image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=500&q=80', latitude: 24.5854, longitude: 73.7125 },
];

const SEED_ADVISORIES: { region: string; severity: MonsoonSeverity; alertTitle: string; description: string }[] = [
  {
    region: 'Himachal Pradesh & Ladakh',
    severity: 'HIGH',
    alertTitle: 'Flash Flood & Landslide Warning',
    description: 'Heavy rainfall reported on Manali-Leh Highway near Rohtang & Baralacha Pass. Travelers advised to delay mountain passes.',
  },
  {
    region: 'Kerala Backwaters',
    severity: 'MEDIUM',
    alertTitle: 'High Water Level Notice',
    description: 'Houseboat operations in Alleppey operating with safety speed limits due to active monsoon currents.',
  },
  {
    region: 'Vrindavan & Mathura',
    severity: 'LOW',
    alertTitle: 'Yamuna Water Level Normal',
    description: 'Darshan queues and ghat entry operating smoothly with routine rain precautions.',
  },
];

async function seedIfEmpty<T>(
  label: string,
  count: () => Promise<number>,
  createMany: (data: T[]) => Promise<unknown>,
  data: T[]
) {
  const existing = await count();
  if (existing > 0) {
    logger.log(`[seed-reference-data] ${label}: ${existing} rows already present, skipping.`);
    return;
  }
  await createMany(data);
  logger.log(`[seed-reference-data] ${label}: inserted ${data.length} rows.`);
}

async function main() {
  await seedIfEmpty('Alert', () => prisma.alert.count(), (data) => prisma.alert.createMany({ data }), SEED_ALERTS);
  await seedIfEmpty('Destination', () => prisma.destination.count(), (data) => prisma.destination.createMany({ data }), SEED_DESTINATIONS);
  await seedIfEmpty('TravelStory', () => prisma.travelStory.count(), (data) => prisma.travelStory.createMany({ data }), SEED_STORIES);
  await seedIfEmpty('WeatherLocation', () => prisma.weatherLocation.count(), (data) => prisma.weatherLocation.createMany({ data }), SEED_WEATHER);
  await seedIfEmpty('MonsoonAdvisory', () => prisma.monsoonAdvisory.count(), (data) => prisma.monsoonAdvisory.createMany({ data }), SEED_ADVISORIES);
  logger.log('[seed-reference-data] Done.');
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

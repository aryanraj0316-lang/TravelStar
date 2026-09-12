import type { PrismaClient } from '@prisma/client';
import { logger } from './logger';

/**
 * Idempotent reference-data seeding, safe to call any number of times and
 * from any process: each table is only seeded if it is currently empty, so
 * it never duplicates rows or overwrites content an admin has since created
 * or edited through the app (docs/REMEDIATION.md §4.9).
 *
 * Shared between two callers:
 * - `npm run seed:reference` (prisma/seed-reference-data.ts) — an explicit,
 *   one-off CLI run, which also documents the full history of why only
 *   `Destination` is seeded here (Alert/WeatherLocation/TravelStory/
 *   MonsoonAdvisory were removed as fabricated-data sources).
 * - src/server.ts, at every boot — so a freshly provisioned or wiped
 *   database (an empty `Destination` table) self-heals on the very next
 *   deploy/restart, with no separate manual step, Shell access, or
 *   production database credential ever needing to leave wherever the
 *   server itself is already running.
 */
const SEED_DESTINATIONS = [
  {
    name: 'Ladakh', tags: 'Adventure • Mountains', rating: 4.8, image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=400&q=80', rank: 1,
    description: 'Ladakh, the land of high passes, is a barren yet beautiful region in the state of Jammu and Kashmir. Bound by two of the world\'s mightiest mountain ranges, the Great Himalaya and the Karakoram, it lies athwart two others, the Ladakh range and the Zanskar range. Known for its crystal clear lakes, ancient monasteries, and cold deserts, it is a haven for adventure travelers and motorcyclists.',
    gallery: ['https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=600&q=80', 'https://images.unsplash.com/photo-1590050752117-238cb0612b1b?w=600&q=80', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'],
    specialties: [
      { icon: 'adventure', title: 'Pangong Tso Lake', desc: 'World\'s highest saltwater lake situated at 4,250 meters altitude.' },
      { icon: 'culture', title: 'Monastery Circuits', desc: 'Visit ancient monasteries like Thiksey, Hemis, and Diskit.' },
      { icon: 'nature', title: 'Nubra Double Hump Camels', desc: 'Explore the high-altitude cold deserts of Nubra Valley on camels.' },
    ],
  },
  {
    name: 'Andaman', tags: 'Beaches • Relaxation', rating: 4.7, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', rank: 2,
    description: 'The Andaman and Nicobar Islands are an archipelago of over 500 islands in the Bay of Bengal, known for their turquoise lagoons, pristine white sand beaches, coral reefs, and historical jail sites. Radhanagar Beach on Havelock Island is globally renowned, offering spectacular sunsets. It is an ideal escape for diving enthusiasts, honeymooners, and families looking for coastal tranquility.',
    gallery: ['https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=600&q=80', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80', 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'],
    specialties: [
      { icon: 'nature', title: 'Radhanagar Beach', desc: 'Awarded as one of Asia\'s best beaches for its smooth sands and blue tides.' },
      { icon: 'adventure', title: 'Scuba & Snorkeling', desc: 'Dive at Havelock Island to witness active marine life and coral reefs.' },
      { icon: 'heritage', title: 'Cellular Jail (Kala Pani)', desc: 'Explore India\'s national memorial with a light and sound historical show.' },
    ],
  },
  {
    name: 'Goa', tags: 'Nightlife • Beaches', rating: 4.6, image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=400&q=80', rank: 3,
    description: 'Goa, the smallest state in India, is famous for its endless sandy beaches, vibrant nightlife, 17th-century Portuguese architecture, and local spice plantations. Divided into North Goa (famous for trance parties, water sports, and crowded flea markets) and South Goa (renowned for peaceful luxury stays and silent beaches), Goa offers a unique blend of Indian and Portuguese cultures.',
    gallery: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80', 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=600&q=80', 'https://images.unsplash.com/photo-1590001155093-a3c66ab0c3ff?w=600&q=80'],
    specialties: [
      { icon: 'cuisine', title: 'Goan Fish Curry', desc: 'Indulge in traditional beach-side seafood, vindaloo, and local cashew feni.' },
      { icon: 'heritage', title: 'Old Goa Churches', desc: 'Visit UNESCO sites like the Basilica of Bom Jesus holding relics of St. Francis.' },
      { icon: 'adventure', title: 'Water Sports', desc: 'Parasailing, jet skiing, and banana boat rides at Calangute and Baga beach.' },
    ],
  },
  {
    name: 'Kerala', tags: 'Nature • Backwaters', rating: 4.9, image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=400&q=80', rank: 4,
    description: 'Often referred to as "God\'s Own Country", Kerala is a tropical paradise situated on the southwestern Malabar coast of India. It is famous for its serene backwaters network of canals, lakes, and rivers, spice plantations, lush tea estates in Munnar, Ayurvedic therapies, and wildlife sanctuaries like Periyar. Its slow pace makes it an ideal destination for ultimate rejuvenation.',
    gallery: ['https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&q=80', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80', 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'],
    specialties: [
      { icon: 'nature', title: 'Alleppey Houseboats', desc: 'Spend a night cruising the serene, palm-fringed backwater lagoons.' },
      { icon: 'stay', title: 'Ayurveda Retreats', desc: 'Indulge in traditional holistic body massages and herbal spa therapies.' },
      { icon: 'cuisine', title: 'Sadya on Banana Leaf', desc: 'Try the traditional multi-course vegetarian feast of Kerala.' },
    ],
  },
  {
    name: 'Manali', tags: 'Snow • Hill Station', rating: 4.8, image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=400&q=80', rank: 5,
    description: 'Manali is a high-altitude Himalayan resort town in Himachal Pradesh, positioned near the northern end of the Kullu Valley. It is a rustic enclave surrounded by towering snow-clad peaks, dense pine forests, and orchards. It is India\'s adventure playground, offering paragliding, skiing, and trekking in Solang Valley, and access to Lahaul and Spiti through the engineering marvel, the Atal Tunnel.',
    gallery: ['https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80', 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=600&q=80', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'],
    specialties: [
      { icon: 'adventure', title: 'Solang Adventure', desc: 'Go paragliding, zorbing, and quad-biking in the Solang meadows.' },
      { icon: 'nature', title: 'Atal Tunnel Corridor', desc: 'Drive through the longest high-altitude tunnel into the Lahaul Valley.' },
      { icon: 'stay', title: 'Old Manali Cafes', desc: 'Relax in wooden cafes offering woodfired pizza, live music, and mountain views.' },
    ],
  },
  {
    name: 'Varanasi', tags: 'Ghats • Ganga River', rating: 4.9, image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80', rank: 6,
    description: 'Varanasi, also known as Kashi or Benares, is one of the world\'s oldest continually inhabited cities and the spiritual heart of India. Situated on the banks of the sacred Ganges River in Uttar Pradesh, Varanasi is famous for its labyrinth of narrow alleys, ancient temples, and over 80 ghats (stone steps leading to the river). The daily Ganga Aarti ceremony at Dashashwamedh Ghat is a mesmerizing spectacle of sound, fire, and devotion.',
    gallery: ['https://images.unsplash.com/photo-1561361041-c96a2a5adfc3?w=600&q=80', 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=600&q=80', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'],
    specialties: [
      { icon: 'culture', title: 'Subah-e-Banaras Aarti', desc: 'Witness the grand morning or evening Ganga Aarti ritual at the ghats.' },
      { icon: 'nature', title: 'Sunrise Boat Ride', desc: 'Take a boat ride along the Ganges to view the ghats as the city wakes up.' },
      { icon: 'cuisine', title: 'Kachori Sabzi & Lassi', desc: 'Indulge in Varanasi\'s famous street food and thick sweet lassi served in mud cups.' },
    ],
  },
  {
    name: 'Udaipur', tags: 'Palaces • Romance', rating: 4.9, image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=400&q=80', rank: 7,
    description: 'Often called the "City of Lakes" or the "Venice of the East", Udaipur is the historic capital of the kingdom of Mewar in Rajasthan. It is built around a series of artificial lakes and is famous for its lavish royal palaces. The grand City Palace complex, which overlooks Lake Pichola, is a monumental architectural marvel. With its romantic lake cruises, heritage mansions, and luxury resorts, it is a favorite for travelers globally.',
    gallery: ['https://images.unsplash.com/photo-1599661046289-e31897846e41?w=600&q=80', 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80', 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'],
    specialties: [
      { icon: 'heritage', title: 'City Palace Complex', desc: 'Explore the grand corridors, museums, and royal courtyard collections.' },
      { icon: 'nature', title: 'Pichola Boat Cruise', desc: 'Sail past Jag Mandir and the Lake Palace during a scenic sunset.' },
      { icon: 'cuisine', title: 'Mewari Laal Maas', desc: 'Savor traditional spicy lamb curry in heritage lakeside restaurants.' },
    ],
  },
  {
    name: 'Darjeeling', tags: 'Tea Gardens • Views', rating: 4.6, image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80', rank: 8,
    description: 'Darjeeling, a hill station in West Bengal, is situated in the lesser Himalayas. It is globally famous for its premium black tea plantations, which are backdropped by the majestic snow peaks of Mount Kanchenjunga, the world\'s third-highest peak. The Darjeeling Himalayan Railway (the "Toy Train"), constructed in the late 19th century, is a UNESCO World Heritage Site.',
    gallery: ['https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&q=80', 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=600&q=80', 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80'],
    specialties: [
      { icon: 'nature', title: 'Tiger Hill Sunrise', desc: 'Wake up early to catch the golden sun rising over Mt. Kanchenjunga.' },
      { icon: 'culture', title: 'Toy Train Ride', desc: 'Enjoy a slow scenic train ride on the historic loop of Ghoom monastery.' },
      { icon: 'stay', title: 'Tea Estate Bungalows', desc: 'Stay in historic British-era tea estate bungalows and pick tea leaves.' },
    ],
  },
];

async function seedIfEmpty<T>(
  label: string,
  count: () => Promise<number>,
  createMany: (data: T[]) => Promise<unknown>,
  data: T[],
) {
  const existing = await count();
  if (existing > 0) {
    logger.log(`[seed-reference-data] ${label}: ${existing} rows already present, skipping.`);
    return;
  }
  await createMany(data);
  logger.log(`[seed-reference-data] ${label}: inserted ${data.length} rows.`);
}

export async function seedReferenceDataIfEmpty(client: PrismaClient): Promise<void> {
  await seedIfEmpty(
    'Destination',
    () => client.destination.count(),
    (data) => client.destination.createMany({ data }),
    SEED_DESTINATIONS,
  );
}

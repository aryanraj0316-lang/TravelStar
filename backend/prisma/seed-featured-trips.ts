import { PrismaClient, TransitMode, PrivacySetting, TripStatus } from '@prisma/client';
import { logger } from '../src/lib/logger';
import { INDIA_CITY_COORDS } from '../src/lib/india-city-coords';

const prisma = new PrismaClient();

export async function seedFeaturedTrips(client: PrismaClient = prisma) {
  logger.info('[seed-featured-trips] Ensuring official organizer account...');

  // 1. Official verified organizer
  const organizer = await client.user.upsert({
    where: { email: 'official@travelstar.app' },
    update: {},
    create: {
      email: 'official@travelstar.app',
      role: 'ORGANIZER',
      verificationStatus: 'VERIFIED',
      profile: {
        create: {
          firstName: 'Yatrenzo',
          lastName: 'Expeditions',
          verifiedBadge: true,
          rating: 4.9,
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
          bio: 'Official Yatrenzo community expedition leader & verified organiser.',
          country: 'India',
        },
      },
    },
    include: { profile: true },
  });

  logger.info(`[seed-featured-trips] Organizer ready: ${organizer.email} (${organizer.id})`);

  // 2. The 4 Featured Group Trips
  const FEATURED_TRIPS_CONFIG = [
    {
      slug: 'featured-vrindavan',
      name: 'Ranchi to Vrindavan Road Trip',
      description:
        'A soulful spiritual and cultural journey connecting Ranchi, Delhi, Mathura, and Vrindavan. Explore the sacred temples of Braj Bhoomi, attend divine evening aartis at Banke Bihari, Prem Mandir, and experience rich heritage with fellow travellers.',
      cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
      startDate: new Date('2026-10-10T06:00:00.000Z'),
      endDate: new Date('2026-10-15T18:00:00.000Z'),
      durationDays: 6,
      budget: 8500,
      availableSeats: 5,
      totalSeats: 12,
      meetingPoint: 'Ranchi Railway Station Main Exit',
      vehicleDetails: 'AC Traveller (Tempo / Innova)',
      hotelDetails: 'Deluxe Twin Sharing Rooms',
      foodIncluded: true,
      guideIncluded: true,
      hotelIncluded: true,
      cabIncluded: true,
      privacy: PrivacySetting.PUBLIC,
      status: TripStatus.ACTIVE,
      rules: 'Respect temple dress codes and guidelines. Punctuality at checkpoints is appreciated.',
      requirements: 'Valid Govt Photo ID (Aadhaar / Voter ID). Comfortable walking footwear.',
      category: 'Religious',
      languages: ['Hindi', 'English'],
      coverImage: 'https://images.unsplash.com/photo-1545232979-fbf6c63b41d2?w=800&q=80',
      latitude: INDIA_CITY_COORDS.vrindavan?.lat ?? 27.5806,
      longitude: INDIA_CITY_COORDS.vrindavan?.lng ?? 77.7006,
      timeline: [
        { city: 'Ranchi', stayDays: 0, transitMode: null, transitTimeMinutes: null, activities: 'Meeting point, trip briefing, and departure.' },
        { city: 'Delhi', stayDays: 1, transitMode: TransitMode.TRAIN, transitTimeMinutes: 720, activities: 'Akshardham temple visit & rest stop.' },
        { city: 'Mathura', stayDays: 2, transitMode: TransitMode.CAB, transitTimeMinutes: 180, activities: 'Shri Krishna Janmabhoomi & Dwarkadhish temple.' },
        { city: 'Vrindavan', stayDays: 3, transitMode: TransitMode.CAB, transitTimeMinutes: 45, activities: 'Banke Bihari, ISKCON, Prem Mandir Light Show & Yamuna Aarti.' },
      ],
    },
    {
      slug: 'featured-varanasi',
      name: 'Varanasi Spiritual Ghats & Sarnath Tour',
      description:
        'Immerse in the timeless spirituality of Kashi. Witness the grand Ganga Aarti from a private boat at Dashashwamedh Ghat, explore ancient temple lanes, savor local delicacies, and visit the serene Buddhist stupas in Sarnath.',
      cities: ['Varanasi', 'Sarnath'],
      startDate: new Date('2026-10-18T07:00:00.000Z'),
      endDate: new Date('2026-10-20T20:00:00.000Z'),
      durationDays: 3,
      budget: 6500,
      availableSeats: 4,
      totalSeats: 10,
      meetingPoint: 'Dashashwamedh Ghat Entry, Varanasi',
      vehicleDetails: 'E-Rickshaws & Local Transit',
      hotelDetails: 'Heritage Guest House near Ghats',
      foodIncluded: true,
      guideIncluded: true,
      hotelIncluded: true,
      cabIncluded: false,
      privacy: PrivacySetting.PUBLIC,
      status: TripStatus.ACTIVE,
      rules: 'Modest clothing for temple visits. Follow boat safety instructions.',
      requirements: 'Government Photo ID, comfortable walking shoes.',
      category: 'Religious',
      languages: ['Hindi', 'English'],
      coverImage: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=800&q=80',
      latitude: INDIA_CITY_COORDS.varanasi?.lat ?? 25.3176,
      longitude: INDIA_CITY_COORDS.varanasi?.lng ?? 82.9739,
      timeline: [
        { city: 'Varanasi', stayDays: 2, transitMode: null, transitTimeMinutes: null, activities: 'Subah-e-Banaras, Kashi Vishwanath corridor & evening Ganga Aarti.' },
        { city: 'Sarnath', stayDays: 1, transitMode: TransitMode.CAB, transitTimeMinutes: 45, activities: 'Dhamek Stupa, Archaeological Museum & deer park visit.' },
      ],
    },
    {
      slug: 'featured-kerala',
      name: 'Kerala Backwaters & Tea Trails',
      description:
        'Glide through the tranquil palm-fringed backwaters of Alleppey on a private traditional houseboat, trek the rolling mist-covered tea plantations of Munnar, and rejuvenate with authentic Ayurvedic wellness.',
      cities: ['Kochi', 'Alleppey', 'Munnar'],
      startDate: new Date('2026-10-25T08:00:00.000Z'),
      endDate: new Date('2026-10-30T17:00:00.000Z'),
      durationDays: 6,
      budget: 24500,
      availableSeats: 4,
      totalSeats: 12,
      meetingPoint: 'Kochi International Airport, Arrival Terminal',
      vehicleDetails: 'AC Mini-Coach with Chauffeur',
      hotelDetails: 'Houseboat Overnight Stay & 4-Star Mountain Resort',
      foodIncluded: true,
      guideIncluded: true,
      hotelIncluded: true,
      cabIncluded: true,
      privacy: PrivacySetting.PUBLIC,
      status: TripStatus.ACTIVE,
      rules: 'Eco-friendly travel: avoid single-use plastics in the backwaters.',
      requirements: 'Light cotton clothing for coast, light woollens for Munnar.',
      category: 'Nature',
      languages: ['English', 'Hindi', 'Malayalam'],
      coverImage: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
      latitude: INDIA_CITY_COORDS.alleppey?.lat ?? 9.4981,
      longitude: INDIA_CITY_COORDS.alleppey?.lng ?? 76.3388,
      timeline: [
        { city: 'Kochi', stayDays: 1, transitMode: null, transitTimeMinutes: null, activities: 'Fort Kochi heritage walk, Chinese fishing nets & Kathakali show.' },
        { city: 'Alleppey', stayDays: 2, transitMode: TransitMode.CAB, transitTimeMinutes: 90, activities: 'Houseboat cruise through backwater canals, village visits & kayaking.' },
        { city: 'Munnar', stayDays: 3, transitMode: TransitMode.CAB, transitTimeMinutes: 240, activities: 'Tea museum, Eravikulam National Park & Top Station viewpoint.' },
      ],
    },
    {
      slug: 'featured-ladakh',
      name: 'Ladakh High Passes & Pangong Expedition',
      description:
        'An epic high-altitude Himalayan circuit covering the dramatic Khardung La pass, the surreal white sand dunes of Nubra Valley with double-humped camels, and the breathtaking deep blue waters of Pangong Tso.',
      cities: ['Leh', 'Nubra', 'Pangong'],
      startDate: new Date('2026-11-05T06:00:00.000Z'),
      endDate: new Date('2026-11-12T18:00:00.000Z'),
      durationDays: 8,
      budget: 38000,
      availableSeats: 3,
      totalSeats: 10,
      meetingPoint: 'Leh Main Market, Near Polo Ground',
      vehicleDetails: '4x4 Expedition Vehicle (Innova / Scorpio)',
      hotelDetails: 'Heritage Hotel in Leh & Luxury Glamping in Nubra & Pangong',
      foodIncluded: true,
      guideIncluded: true,
      hotelIncluded: true,
      cabIncluded: true,
      privacy: PrivacySetting.PUBLIC,
      status: TripStatus.ACTIVE,
      rules: 'Mandatory 24-hour acclimatization in Leh on Day 1. Stay well hydrated.',
      requirements: 'Heavy woollens, thermal innerwear, sun protection, valid Govt ID for Inner Line Permits.',
      category: 'Adventure',
      languages: ['English', 'Hindi'],
      coverImage: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
      latitude: INDIA_CITY_COORDS.leh?.lat ?? 34.1526,
      longitude: INDIA_CITY_COORDS.leh?.lng ?? 77.5771,
      timeline: [
        { city: 'Leh', stayDays: 3, transitMode: null, transitTimeMinutes: null, activities: 'Acclimatization, Shanti Stupa, Leh Palace & Thiksey Monastery.' },
        { city: 'Nubra', stayDays: 2, transitMode: TransitMode.CAB, transitTimeMinutes: 300, activities: 'Drive via Khardung La, Diskit Monastery & Hunder sand dunes.' },
        { city: 'Pangong', stayDays: 3, transitMode: TransitMode.CAB, transitTimeMinutes: 360, activities: 'Drive via Shyok, lakeside sunset & sunrise, stargazing camp.' },
      ],
    },
  ];

  const createdTripIds: string[] = [];

  for (const config of FEATURED_TRIPS_CONFIG) {
    const existing = await client.trip.findFirst({
      where: { name: config.name },
    });

    let tripId: string;
    if (existing) {
      tripId = existing.id;
      await client.trip.update({
        where: { id: tripId },
        data: {
          description: config.description,
          cities: config.cities,
          startDate: config.startDate,
          endDate: config.endDate,
          durationDays: config.durationDays,
          budget: config.budget,
          availableSeats: config.availableSeats,
          totalSeats: config.totalSeats,
          meetingPoint: config.meetingPoint,
          vehicleDetails: config.vehicleDetails,
          hotelDetails: config.hotelDetails,
          foodIncluded: config.foodIncluded,
          guideIncluded: config.guideIncluded,
          hotelIncluded: config.hotelIncluded,
          cabIncluded: config.cabIncluded,
          privacy: config.privacy,
          status: config.status,
          rules: config.rules,
          requirements: config.requirements,
          category: config.category,
          languages: config.languages,
          coverImage: config.coverImage,
          latitude: config.latitude,
          longitude: config.longitude,
        },
      });
      logger.info(`[seed-featured-trips] Updated trip: ${config.name} (${tripId})`);
    } else {
      const created = await client.trip.create({
        data: {
          creatorId: organizer.id,
          name: config.name,
          description: config.description,
          cities: config.cities,
          startDate: config.startDate,
          endDate: config.endDate,
          durationDays: config.durationDays,
          budget: config.budget,
          availableSeats: config.availableSeats,
          totalSeats: config.totalSeats,
          meetingPoint: config.meetingPoint,
          vehicleDetails: config.vehicleDetails,
          hotelDetails: config.hotelDetails,
          foodIncluded: config.foodIncluded,
          guideIncluded: config.guideIncluded,
          hotelIncluded: config.hotelIncluded,
          cabIncluded: config.cabIncluded,
          privacy: config.privacy,
          status: config.status,
          rules: config.rules,
          requirements: config.requirements,
          category: config.category,
          languages: config.languages,
          coverImage: config.coverImage,
          latitude: config.latitude,
          longitude: config.longitude,
        },
      });
      tripId = created.id;
      logger.info(`[seed-featured-trips] Created trip: ${config.name} (${tripId})`);
    }

    createdTripIds.push(tripId);

    // Group chat room for the trip
    let chatRoom = await client.chatRoom.findUnique({ where: { tripId } });
    if (!chatRoom) {
      chatRoom = await client.chatRoom.create({
        data: {
          name: config.name,
          isGroup: true,
          tripId,
        },
      });
      logger.info(`[seed-featured-trips] Created chat room for ${config.name}: ${chatRoom.id}`);
    }

    // Ensure organizer is member of chat room
    await client.chatRoomMember.upsert({
      where: { chatRoomId_userId: { chatRoomId: chatRoom.id, userId: organizer.id } },
      create: { chatRoomId: chatRoom.id, userId: organizer.id },
      update: {},
    });

    // Timeline stops
    await client.tripTimelineStop.deleteMany({ where: { tripId } });
    for (let order = 0; order < config.timeline.length; order++) {
      const stop = config.timeline[order]!;
      const cityKey = stop.city.toLowerCase();
      const coords = INDIA_CITY_COORDS[cityKey];
      await client.tripTimelineStop.create({
        data: {
          tripId,
          order,
          city: stop.city,
          stayDays: stop.stayDays,
          transitMode: stop.transitMode,
          transitTimeMinutes: stop.transitTimeMinutes,
          activities: stop.activities,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
      });
    }
  }

  // 3. Delete ANY other trips that are not these 4
  const deletedOtherTrips = await client.trip.deleteMany({
    where: { id: { notIn: createdTripIds } },
  });

  if (deletedOtherTrips.count > 0) {
    logger.info(`[seed-featured-trips] Deleted ${deletedOtherTrips.count} other non-featured trips.`);
  }

  // 4. Verify only these 4 trips exist
  const totalTrips = await client.trip.count();
  const allTrips = await client.trip.findMany({ select: { id: true, name: true, category: true } });

  logger.info(`[seed-featured-trips] Total trips in database: ${totalTrips}`);
  allTrips.forEach((t) => logger.info(`  - ${t.name} (${t.category}) [${t.id}]`));
}

async function main() {
  await seedFeaturedTrips();
}

if (require.main === module) {
  main()
    .catch((e) => {
      logger.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

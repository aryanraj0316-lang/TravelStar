import { PrismaClient, UserRole, BookingType, BookingStatus, PaymentStatus } from '@prisma/client';
import argon2 from 'argon2';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

/**
 * This script deletes every user before seeding. Pointed at the wrong
 * DATABASE_URL, that wipes production.
 *
 * There is no separate "local Postgres" convention in this project — the
 * only configured DATABASE_URL is a hosted Neon instance, used for both dev
 * and (eventually) prod. A hostname allowlist (e.g. "must contain
 * localhost") can't distinguish a Neon dev branch from a Neon prod branch,
 * so it would either block the team's real workflow or fail to catch the
 * actual mistake it exists for. Instead this requires an explicit, separate
 * opt-in that has to be set on purpose per run — never defaulted, never
 * inferred from the URL.
 */
function assertSafeToSeed() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`Refusing to seed: NODE_ENV is "${nodeEnv}", expected development or test.`);
  }

  if (process.env.SEED_CONFIRM_WIPE !== 'yes-wipe-this-database') {
    throw new Error(
      'Refusing to seed: this deletes every user, wallet, and booking in the ' +
        'database currently pointed to by DATABASE_URL. Confirm you mean to run ' +
        'this against that specific database by setting:\n' +
        '  SEED_CONFIRM_WIPE=yes-wipe-this-database'
    );
  }
}

const DEMO_PASSWORD = 'travelstar-dev-2026';

async function main() {
  assertSafeToSeed();
  logger.log('Seeding database...');

  const demoPasswordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  // Clear every table before reseeding. A manually maintained list of models
  // to delete, in FK-safe order, silently drifts as the schema grows — the
  // previous version of this script did exactly that, missed several
  // dependent tables, and only "worked" because its errors were swallowed by
  // a `.catch(() => {})`. TRUNCATE ... CASCADE clears the whole dependency
  // graph in one statement regardless of table order, so there is nothing to
  // keep in sync by hand.
  const tables: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length > 0) {
    const identifiers = tables.map((t) => `"${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE;`);
  }

  // 1. Create a Tourist User
  const touristUser = await prisma.user.create({
    data: {
      email: 'tourist@travelstar.com',
      passwordHash: demoPasswordHash,
      role: UserRole.TOURIST,
      verificationStatus: 'VERIFIED',
      profile: {
        create: {
          firstName: 'Aarav',
          lastName: 'Sharma',
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
          verifiedBadge: true,
          bio: 'Backpacker & Mountain Enthusiast 🏔️',
        },
      },
      wallet: {
        create: {
          balance: 2500.0,
        },
      },
    },
  });
  logger.log('Tourist user created:', touristUser.email);

  // 2. Create a Guide User
  const guideUser = await prisma.user.create({
    data: {
      email: 'guide@travelstar.com',
      passwordHash: demoPasswordHash,
      role: UserRole.GUIDE,
      verificationStatus: 'VERIFIED',
      profile: {
        create: {
          firstName: 'Rajesh',
          lastName: 'Kumar',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
          verifiedBadge: true,
          bio: 'Certified travel guide for Jaipur, Sikkim, and Munnar hills. 10+ years experience.',
        },
      },
      wallet: {
        create: {
          balance: 15450.0,
        },
      },
    },
  });
  logger.log('Guide user created:', guideUser.email);

  // 3. Create Guide Profile
  const guideProfile = await prisma.guideProfile.create({
    data: {
      userId: guideUser.id,
      licenseNumber: 'LIC-RAJESH-12345',
      licensePhotoUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=300',
      experienceYears: 10,
      expertisePlaces: ['Jaipur', 'Sikkim', 'Munnar'],
      languagesSpoken: ['Hindi', 'English', 'Bengali'],
      hourlyRate: 350.0,
      dailyRate: 2500.0,
      availability: {},
      verifiedStatus: 'VERIFIED',
      rating: 4.9,
    },
  });
  logger.log('Guide profile created:', guideProfile.licenseNumber);

  // 4. Create Guide Packages
  const pkg1 = await prisma.guidePackage.create({
    data: {
      guideProfileId: guideProfile.id,
      title: 'Pink City Heritage Exploration',
      description: 'Cover Amer Fort, Hawa Mahal, City Palace, and local hidden stepwells with a certified local guide. Includes transport assistance.',
      price: 2500.0,
      durationDays: 2,
      citiesIncluded: ['Jaipur'],
    },
  });

  await prisma.guidePackage.create({
    data: {
      guideProfileId: guideProfile.id,
      title: 'North Sikkim Expedition Guide',
      description: 'Guidance through high-altitude lakes (Gurudongmar), Yumthang Valley, and Lachung. Permits coordination included.',
      price: 6000.0,
      durationDays: 4,
      citiesIncluded: ['Gangtok', 'Lachung', 'Lachen'],
    },
  });

  await prisma.guidePackage.create({
    data: {
      guideProfileId: guideProfile.id,
      title: 'Munnar Tea Gardens Walking Tour',
      description: 'Slow paced walk through tea plantations, lockhart gap, and spice garden visits. Photogenic spots recommended.',
      price: 1800.0,
      durationDays: 1,
      citiesIncluded: ['Munnar'],
    },
  });
  logger.log('Guide packages created.');

  // 5. Create Guide Reels
  await prisma.guideReel.createMany({
    data: [
      {
        guideProfileId: guideProfile.id,
        videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-beautiful-landscape-of-mountains-with-snow-40439-large.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=300',
        caption: 'Beautiful snowy pass of North Sikkim. Road is completely clear today!',
        likesCount: 154,
        viewsCount: 1205,
      },
      {
        guideProfileId: guideProfile.id,
        videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-jaipur-palace-details-43024-large.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=300',
        caption: 'Hawa Mahal sunrise view. Best spot for photography without the crowds!',
        likesCount: 88,
        viewsCount: 654,
      },
    ],
  });
  logger.log('Guide reels created.');

  // 6. Create Travel Stories
  await prisma.travelStory.createMany({
    data: [
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
        content: 'Floating through the serene backwaters on a houseboat was the most peaceful experience.',
        coverImg: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
        likesCount: 42,
        location: 'Alleppey, Kerala',
        hasReel: false,
      },
    ],
  });
  logger.log('Travel stories created.');

  // 7. Create Emergency Contact for the Guide
  await prisma.emergencyContact.create({
    data: {
      userId: guideUser.id,
      name: 'Sunita Kumar',
      relation: 'Spouse',
      phoneNumber: '+91 99999 88888',
    },
  });

  // 8. Create Monsoon Advisories
  await prisma.monsoonAdvisory.createMany({
    data: [
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
    ],
  });
  logger.log('Monsoon advisories created.');

  // 9. Weather locations seed
  await prisma.weatherLocation.createMany({
    data: [
      { name: 'New Delhi', place: 'India Gate', temp: '32°C', condition: 'Partly Sunny', aqi: 'Good AQI • 42', humidity: '48%', image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80', latitude: 28.6139, longitude: 77.2090 },
      { name: 'Jaipur', place: 'Hawa Mahal', temp: '35°C', condition: 'Warm & Sunny', aqi: 'Moderate AQI • 65', humidity: '35%', image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80', latitude: 26.9124, longitude: 75.7873 },
      { name: 'Munnar', place: 'Tea Gardens', temp: '22°C', condition: 'Mist & Clouds', aqi: 'Pure AQI • 12', humidity: '75%', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&q=80', latitude: 10.0889, longitude: 77.0595 },
    ],
  });
  logger.log('Weather locations created.');

  // 10. Create Bookings to generate non-zero charts for the week
  // Let's create bookings spread across different days of the current/recent week
  // Map days to specific dates to make sure booking dates map to:
  // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const today = new Date();
  const getDayOffsetDate = (targetDayOfWeek: number) => {
    // targetDayOfWeek: 0 Sunday, 1 Monday, etc.
    const resultDate = new Date(today);
    const currentDay = today.getDay();
    const distance = targetDayOfWeek - currentDay;
    resultDate.setDate(today.getDate() + distance);
    return resultDate;
  };

  const daysOfWeek = [1, 2, 4, 5, 6]; // Mon, Tue, Thu, Fri, Sat
  const bookingAmounts = [2500, 5000, 1800, 3000, 4500];

  for (let i = 0; i < daysOfWeek.length; i++) {
    const bDate = getDayOffsetDate(daysOfWeek[i]!);
    await prisma.booking.create({
      data: {
        userId: touristUser.id,
        type: BookingType.GUIDE,
        targetId: pkg1.id,
        guideProfileId: guideProfile.id,
        bookingDate: bDate,
        travelDate: new Date(bDate.getTime() + 24 * 60 * 60 * 1000), // travel next day
        amount: bookingAmounts[i]!,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.SUCCESS,
      },
    });
  }
  logger.log('Earnings bookings seeded.');

  logger.log('Seeding completed successfully.');
  logger.log(`Demo accounts — password for both: ${DEMO_PASSWORD}`);
  logger.log(`  Tourist: ${touristUser.email}`);
  logger.log(`  Guide:   ${guideUser.email}`);
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

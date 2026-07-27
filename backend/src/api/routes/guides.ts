import { Router } from 'express';
import jwt from 'jsonwebtoken';
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

// 0. Get list of all guides for homepage
router.get('/', async (req, res) => {
  try {
    const dbGuides = await prisma.guideProfile.findMany({
      include: {
        user: {
          include: { profile: true }
        }
      }
    });

    const mapped = dbGuides.map(g => ({
      id: g.id,
      name: g.user?.profile?.firstName ? `${g.user.profile.firstName} ${g.user.profile.lastName || ''}`.trim() : 'Verified Guide',
      rating: g.rating || 5.0,
      languages: g.languagesSpoken || ['Hindi', 'English'],
      dailyRate: g.dailyRate || 2500,
      expertise: g.expertisePlaces || ['Jaipur', 'Vrindavan'],
    }));

    if (mapped.length === 0) {
      mapped.push({
        id: 'guide-1',
        name: 'Rajesh Kumar',
        rating: 4.9,
        languages: ['Hindi', 'English'],
        dailyRate: 2200,
        expertise: ['Vrindavan', 'Agra'],
      });
    }

    return res.status(200).json({ status: 'success', data: mapped });
  } catch (err) {
    console.error('[Guides] Get guides list error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve guides' });
  }
});

// 1. Get/Create Guide Profile
router.get('/profile', async (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    let guide = await prisma.guideProfile.findUnique({
      where: { userId },
      include: {
        packages: true,
      }
    });

    if (!guide) {
      const newGuide = await prisma.guideProfile.create({
        data: {
          userId,
          licenseNumber: `LIC-${userId.slice(0, 8).toUpperCase()}-${Date.now()}`,
          licensePhotoUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=300',
          experienceYears: 5,
          expertisePlaces: ['Sikkim', 'Jaipur', 'Munnar'],
          languagesSpoken: ['Hindi', 'English'],
          hourlyRate: 350,
          dailyRate: 2500,
          availability: {},
          verifiedStatus: 'VERIFIED' as any,
        },
        include: {
          packages: true,
        }
      });
      guide = newGuide as any;
    }

    return res.status(200).json({ status: 'success', data: guide });
  } catch (err) {
    console.error('[Guides] Get profile error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// 2. GET Hub & Earnings details
router.get('/:id/earnings', async (req, res) => {
  const { id } = req.params;
  try {
    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
      include: {
        user: {
          include: { wallet: true }
        }
      }
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const walletBalance = guideProfile.user?.wallet?.balance || 0;

    // Fetch confirmed bookings for this guide
    const bookings = await prisma.booking.findMany({
      where: {
        guideProfileId: id,
        status: 'CONFIRMED',
      },
      include: {
        payments: true,
      }
    });

    const totalEarnings = bookings.reduce((sum, b) => sum + b.amount, 0);

    const completedTripsCount = await prisma.booking.count({
      where: {
        guideProfileId: id,
        status: 'COMPLETED'
      }
    });

    const activeLeadsCount = await prisma.joinRequest.count({
      where: { status: 'PENDING' }
    });

    // Populate daily chart heights based on day of week of booking date
    const chartData = [
      { day: 'Mon', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Tue', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Wed', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Thu', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Fri', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Sat', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Sun', amt: 0, height: 5, amtText: '₹0' },
    ];

    bookings.forEach((b) => {
      const dayIndex = new Date(b.bookingDate).getDay(); // 0 Sunday, 1 Monday...
      const indexMap = [6, 0, 1, 2, 3, 4, 5];
      const targetIndex = indexMap[dayIndex];
      chartData[targetIndex].amt += b.amount;
    });

    const maxAmt = Math.max(...chartData.map((c) => c.amt), 1);
    chartData.forEach((c) => {
      c.height = Math.round((c.amt / maxAmt) * 100) || 5;
      c.amtText = c.amt > 0 ? `₹${Math.round(c.amt / 100) / 10}k` : '₹0';
    });

    return res.status(200).json({
      status: 'success',
      data: {
        walletBalance,
        totalEarnings,
        completedTripsCount,
        activeLeadsCount,
        chartData,
        hasActivity: bookings.length > 0 || completedTripsCount > 0,
      }
    });
  } catch (err) {
    console.error('[Guides] Get earnings error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve earnings stats' });
  }
});

// 3. Packages CRUD
router.get('/:id/packages', async (req, res) => {
  const { id } = req.params;
  try {
    const packages = await prisma.guidePackage.findMany({
      where: { guideProfileId: id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ status: 'success', data: packages });
  } catch (err) {
    console.error('[Guides] Get packages error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve packages' });
  }
});

router.post('/:id/packages', async (req, res) => {
  const { id } = req.params;
  const { title, description, price, durationDays, citiesIncluded } = req.body;
  try {
    const newPackage = await prisma.guidePackage.create({
      data: {
        guideProfileId: id,
        title,
        description: description || '',
        price: parseFloat(price) || 1000,
        durationDays: parseInt(durationDays) || 1,
        citiesIncluded: citiesIncluded || [],
      } as any
    });
    return res.status(201).json({ status: 'success', data: newPackage });
  } catch (err) {
    console.error('[Guides] Create package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create package' });
  }
});

router.put('/:id/packages/:packageId', async (req, res) => {
  const { packageId } = req.params;
  const { title, description, price, durationDays, citiesIncluded } = req.body;
  try {
    const updated = await prisma.guidePackage.update({
      where: { id: packageId },
      data: {
        title,
        description,
        price: price ? parseFloat(price) : undefined,
        durationDays: durationDays ? parseInt(durationDays) : undefined,
        citiesIncluded,
      }
    });
    return res.status(200).json({ status: 'success', data: updated });
  } catch (err) {
    console.error('[Guides] Update package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update package' });
  }
});

router.delete('/:id/packages/:packageId', async (req, res) => {
  const { packageId } = req.params;
  try {
    await prisma.guidePackage.delete({
      where: { id: packageId },
    });
    return res.status(200).json({ status: 'success', message: 'Package deleted successfully' });
  } catch (err) {
    console.error('[Guides] Delete package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to delete package' });
  }
});

// 4. Reels CRUD
router.get('/:id/reels', async (req, res) => {
  const { id } = req.params;
  try {
    const reels = await prisma.guideReel.findMany({
      where: { guideProfileId: id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ status: 'success', data: reels });
  } catch (err) {
    console.error('[Guides] Get reels error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve reels' });
  }
});

router.post('/:id/reels', async (req, res) => {
  const { id } = req.params;
  const { videoUrl, thumbnailUrl, caption } = req.body;
  try {
    const newReel = await prisma.guideReel.create({
      data: {
        guideProfileId: id,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        caption: caption || '',
      }
    });
    return res.status(201).json({ status: 'success', data: newReel });
  } catch (err) {
    console.error('[Guides] Create reel error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to publish reel' });
  }
});

// 5. Live Status (Coordinates & Booking link)
router.get('/:id/live-status', async (req, res) => {
  const { id } = req.params;
  try {
    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const latestLoc = await prisma.liveLocation.findFirst({
      where: { userId: guideProfile.userId },
      orderBy: { updatedAt: 'desc' },
    });

    // Check if there is an active guiding booking right now
    const activeBooking = await prisma.booking.findFirst({
      where: {
        guideProfileId: id,
        status: 'CONFIRMED',
      },
      orderBy: { bookingDate: 'desc' },
    });

    return res.status(200).json({
      status: 'success',
      data: {
        location: latestLoc,
        activeGuiding: activeBooking ? {
          bookingId: activeBooking.id,
          targetId: activeBooking.targetId,
          amount: activeBooking.amount,
        } : null,
      }
    });
  } catch (err) {
    console.error('[Guides] Get live status error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve live status' });
  }
});

router.post('/:id/live-status', async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;
  try {
    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const existingLoc = await prisma.liveLocation.findFirst({
      where: { userId: guideProfile.userId },
    });

    let updatedLoc;
    if (existingLoc) {
      updatedLoc = await prisma.liveLocation.update({
        where: { id: existingLoc.id },
        data: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          updatedAt: new Date(),
        }
      });
    } else {
      updatedLoc = await prisma.liveLocation.create({
        data: {
          userId: guideProfile.userId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        }
      });
    }

    return res.status(200).json({ status: 'success', data: updatedLoc });
  } catch (err) {
    console.error('[Guides] Post live status error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update live location status' });
  }
});

// 6. Guide Leads — pending JoinRequests from trips matching guide expertise
router.get('/:id/leads', async (req, res) => {
  const { id } = req.params;
  try {
    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const expertiseCities = guideProfile.expertisePlaces || [];

    // Find pending join requests for trips that match guide's expertise cities
    const joinRequests = await prisma.joinRequest.findMany({
      where: {
        status: 'PENDING',
        trip: {
          cities: {
            hasSome: expertiseCities,
          },
        },
      },
      include: {
        user: {
          include: { profile: true },
        },
        trip: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const leads = joinRequests.map((jr) => {
      const profile = jr.user?.profile;
      return {
        id: jr.id,
        name: profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : (jr.user?.email?.split('@')[0] || 'Traveler'),
        avatar: profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        destination: jr.trip?.cities?.join(' & ') || jr.trip?.name || 'Unknown',
        groupSize: jr.trip?.totalSeats || 1,
        durationDays: jr.trip?.durationDays || 1,
        budget: jr.trip?.budget || 0,
        startDate: jr.trip?.startDate ? new Date(jr.trip.startDate).toISOString().split('T')[0] : 'TBD',
        description: jr.message || jr.trip?.description || 'Looking for a guide for this trip.',
        status: 'PENDING' as const,
        tripId: jr.tripId,
      };
    });

    return res.status(200).json({ status: 'success', data: leads });
  } catch (err) {
    console.error('[Guides] Get leads error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve leads' });
  }
});

export default router;


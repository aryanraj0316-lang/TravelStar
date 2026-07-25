import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

// Default In-Memory Profile Fallback
let activeProfile = {
  id: 'user-1',
  name: 'Aarav Sharma',
  email: 'aarav@example.com',
  phoneNumber: '+919876543210',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  role: 'TOURIST',
  isVerified: true,
  aadhaarStatus: 'VERIFIED',
  guideLicenseStatus: 'NONE',
  walletBalance: 2450.0,
  rewardPoints: 120,
};

// Register New User (PostgreSQL + Prisma)
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const userEmail = email || `user_${Date.now()}@travelstar.com`;

  try {
    // Check if user already exists
    let user = await prisma.user.findFirst({
      where: { email: userEmail },
      include: { profile: true, wallet: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          passwordHash: password || 'default_password',
          role: role || 'TOURIST',
          verificationStatus: 'VERIFIED',
          profile: {
            create: {
              firstName: (name || 'New User').split(' ')[0],
              lastName: (name || 'New User').split(' ')[1] || '',
              avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
              verifiedBadge: true,
            },
          },
          wallet: {
            create: {
              balance: 500.0, // Welcome bonus
              rewardPoints: 50,
            },
          },
        },
        include: {
          profile: true,
          wallet: true,
        },
      });
    }

    activeProfile = {
      id: user.id,
      name: name || (user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : 'New User'),
      email: user.email || userEmail,
      phoneNumber: user.phoneNumber || '',
      avatar: user.profile?.avatarUrl || activeProfile.avatar,
      role: (role || user.role) as any,
      isVerified: true,
      aadhaarStatus: 'VERIFIED',
      guideLicenseStatus: (role || user.role) === 'GUIDE' ? 'VERIFIED' : 'NONE',
      walletBalance: user.wallet?.balance || 500.0,
      rewardPoints: user.wallet?.rewardPoints || 50,
    };

    const token = jwt.sign({ userId: user.id, role: activeProfile.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      status: 'success',
      token,
      user: activeProfile,
      message: 'Account created & saved to PostgreSQL DB',
    });
  } catch (err) {
    console.warn('[Postgres DB Warn] Registration fallback used:', err);
    activeProfile = {
      ...activeProfile,
      id: `user-${Date.now()}`,
      name: name || activeProfile.name,
      email: userEmail,
      role: role || 'TOURIST',
      isVerified: true,
    };

    const token = jwt.sign(activeProfile, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({
      status: 'success',
      token,
      user: activeProfile,
    });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { profile: true, wallet: true },
    });

    if (user) {
      activeProfile = {
        id: user.id,
        name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : activeProfile.name,
        email: user.email || email,
        phoneNumber: user.phoneNumber || '',
        avatar: user.profile?.avatarUrl || activeProfile.avatar,
        role: user.role as any,
        isVerified: true,
        aadhaarStatus: 'VERIFIED',
        guideLicenseStatus: user.role === 'GUIDE' ? 'VERIFIED' : 'NONE',
        walletBalance: user.wallet?.balance || activeProfile.walletBalance,
        rewardPoints: user.wallet?.rewardPoints || activeProfile.rewardPoints,
      };

      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({
        status: 'success',
        token,
        user: activeProfile,
      });
    }
  } catch (err) {
    console.warn('[Postgres DB Warn] Login fallback used:', err);
  }

  if (email) {
    activeProfile.email = email;
  }
  const token = jwt.sign(activeProfile, JWT_SECRET, { expiresIn: '7d' });
  return res.status(200).json({
    status: 'success',
    token,
    user: activeProfile,
  });
});

// Get User Profile
router.get('/profile', async (req, res) => {
  res.status(200).json({ status: 'success', data: activeProfile });
});

// Update User Profile
router.put('/profile', async (req, res) => {
  const updates = req.body;
  activeProfile = {
    ...activeProfile,
    ...updates,
  };
  res.status(200).json({ status: 'success', data: activeProfile });
});

export default router;

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

// Default In-Memory Profile Fallback
let activeProfile: any = {
  id: 'user-1',
  name: 'Aarav Sharma',
  email: 'aarav@example.com',
  phoneNumber: '+91 98765 43210',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  role: 'TOURIST',
  isVerified: true,
  aadhaarStatus: 'VERIFIED',
  guideLicenseStatus: 'NONE',
  walletBalance: 2450.0,
  rewardPoints: 120,
  gender: 'Male',
  bio: 'Backpacker & Mountain Enthusiast 🏔️ | Exploring Incredible India 🇮🇳',
  emergencyContact: '+91 98111 22334',
  languages: 'Hindi, English, Punjabi',
  travelStyles: 'Mountains, Backpacking, Photography',
  pushNotifications: true,
  locationSharing: true,
  selectedLanguage: 'English',
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
      gender: user.profile?.gender || activeProfile.gender,
      bio: user.profile?.bio || activeProfile.bio,
      emergencyContact: '',
      languages: user.profile?.languages ? user.profile.languages.join(', ') : activeProfile.languages,
      travelStyles: user.profile?.travelStyle ? user.profile.travelStyle.join(', ') : activeProfile.travelStyles,
      pushNotifications: user.profile?.pushNotifications !== undefined ? user.profile.pushNotifications : activeProfile.pushNotifications,
      locationSharing: user.profile?.locationSharing !== undefined ? user.profile.locationSharing : activeProfile.locationSharing,
      selectedLanguage: user.profile?.selectedLanguage || activeProfile.selectedLanguage,
    };

    const token = jwt.sign({ id: user.id, userId: user.id, role: activeProfile.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      status: 'success',
      token,
      user: activeProfile,
      message: 'Account created & saved to PostgreSQL DB',
    });
  } catch (err) {
    console.warn('[Postgres DB Warn] Registration failed:', err);
    return res.status(500).json({ status: 'error', message: 'Registration failed due to database connection issue. Please try again.' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { profile: true, wallet: true, emergencyContacts: true },
    });

    if (user) {
      if (user.passwordHash && user.passwordHash !== password) {
        return res.status(401).json({ status: 'error', message: 'Invalid password. Please try again.' });
      }

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
        gender: user.profile?.gender || activeProfile.gender,
        bio: user.profile?.bio || activeProfile.bio,
        languages: user.profile?.languages ? user.profile.languages.join(', ') : activeProfile.languages,
        travelStyles: user.profile?.travelStyle ? user.profile.travelStyle.join(', ') : activeProfile.travelStyles,
        emergencyContact: user.emergencyContacts?.[0]?.phoneNumber || activeProfile.emergencyContact,
        pushNotifications: user.profile?.pushNotifications !== undefined ? user.profile.pushNotifications : activeProfile.pushNotifications,
        locationSharing: user.profile?.locationSharing !== undefined ? user.profile.locationSharing : activeProfile.locationSharing,
        selectedLanguage: user.profile?.selectedLanguage || activeProfile.selectedLanguage,
      };

      const token = jwt.sign({ id: user.id, userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({
        status: 'success',
        token,
        user: activeProfile,
      });
    } else {
      return res.status(404).json({ status: 'error', message: 'This email is not registered. Please create an account first.' });
    }
  } catch (err) {
    console.warn('[Postgres DB Warn] Login failed:', err);
    return res.status(500).json({ status: 'error', message: 'Database connection issue. Please try again.' });
  }
});

// Get User Profile
router.get('/profile', async (req, res) => {
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id || decoded.userId;
    } catch (e) {
      // Invalid token, ignore
    }
  }

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true, wallet: true, emergencyContacts: true },
      });
      if (user) {
        const userProfile = {
          id: user.id,
          name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : activeProfile.name,
          email: user.email || activeProfile.email,
          phoneNumber: user.phoneNumber || '',
          avatar: user.profile?.avatarUrl || activeProfile.avatar,
          role: user.role as any,
          isVerified: true,
          aadhaarStatus: 'VERIFIED',
          guideLicenseStatus: user.role === 'GUIDE' ? 'VERIFIED' : 'NONE',
          walletBalance: user.wallet?.balance || activeProfile.walletBalance,
          rewardPoints: user.wallet?.rewardPoints || activeProfile.rewardPoints,
          gender: user.profile?.gender || activeProfile.gender,
          bio: user.profile?.bio || activeProfile.bio,
          languages: user.profile?.languages ? user.profile.languages.join(', ') : activeProfile.languages,
          travelStyles: user.profile?.travelStyle ? user.profile.travelStyle.join(', ') : activeProfile.travelStyles,
          emergencyContact: user.emergencyContacts?.[0]?.phoneNumber || activeProfile.emergencyContact,
          pushNotifications: user.profile?.pushNotifications !== undefined ? user.profile.pushNotifications : activeProfile.pushNotifications,
          locationSharing: user.profile?.locationSharing !== undefined ? user.profile.locationSharing : activeProfile.locationSharing,
          selectedLanguage: user.profile?.selectedLanguage || activeProfile.selectedLanguage,
        };
        // Sync activeProfile fallback for non-token paths
        activeProfile = userProfile;
        return res.status(200).json({ status: 'success', data: userProfile });
      }
    } catch (err) {
      console.warn('[Postgres DB Warn] Get profile failed:', err);
    }
  }
  return res.status(200).json({ status: 'success', data: activeProfile });
});

// Update User Profile
router.put('/profile', async (req, res) => {
  const updates = req.body;
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id || decoded.userId;
    } catch (e) {
      // Invalid token, ignore
    }
  }

  // Update in-memory activeProfile fallback
  activeProfile = {
    ...activeProfile,
    ...updates,
  };

  const targetUserId = userId || (activeProfile.id && !activeProfile.id.startsWith('user-') ? activeProfile.id : null);

  if (targetUserId) {
    try {
      // Split name into firstName and lastName
      const nameParts = (updates.name || activeProfile.name).split(' ');
      const firstName = nameParts[0] || 'Aarav';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Update User table fields (such as phone number)
      const userUpdateData: any = {};
      if (updates.phoneNumber !== undefined) {
        userUpdateData.phoneNumber = updates.phoneNumber;
      }

      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: userUpdateData,
        });
      }

      // Update Profile table fields
      const profileUpdateData: any = {};
      if (updates.name !== undefined) {
        profileUpdateData.firstName = firstName;
        profileUpdateData.lastName = lastName;
      }
      if (updates.avatar !== undefined) {
        profileUpdateData.avatarUrl = updates.avatar;
      }
      if (updates.gender !== undefined) {
        profileUpdateData.gender = updates.gender;
      }
      if (updates.bio !== undefined) {
        profileUpdateData.bio = updates.bio;
      }
      if (updates.languages !== undefined) {
        profileUpdateData.languages = typeof updates.languages === 'string'
          ? updates.languages.split(',').map((l: string) => l.trim())
          : updates.languages;
      }
      if (updates.travelStyles !== undefined) {
        profileUpdateData.travelStyle = typeof updates.travelStyles === 'string'
          ? updates.travelStyles.split(',').map((s: string) => s.trim())
          : updates.travelStyles;
      }

      if (updates.pushNotifications !== undefined) {
        profileUpdateData.pushNotifications = updates.pushNotifications;
      }
      if (updates.locationSharing !== undefined) {
        profileUpdateData.locationSharing = updates.locationSharing;
      }
      if (updates.selectedLanguage !== undefined) {
        profileUpdateData.selectedLanguage = updates.selectedLanguage;
      }

      await prisma.profile.update({
        where: { userId: targetUserId },
        data: profileUpdateData,
      });

      // Update Emergency contact inside EmergencyContact table if provided
      if (updates.emergencyContact) {
        const contact = await prisma.emergencyContact.findFirst({
          where: { userId: targetUserId },
        });
        if (contact) {
          await prisma.emergencyContact.update({
            where: { id: contact.id },
            data: { phoneNumber: updates.emergencyContact },
          });
        } else {
          await prisma.emergencyContact.create({
            data: {
              userId: targetUserId,
              name: 'Emergency SOS Contact',
              relation: 'SOS',
              phoneNumber: updates.emergencyContact,
            },
          });
        }
      }

      // Load updated user details
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { profile: true, wallet: true, emergencyContacts: true },
      });
      if (user) {
        activeProfile = {
          id: user.id,
          name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : activeProfile.name,
          email: user.email || activeProfile.email,
          phoneNumber: user.phoneNumber || '',
          avatar: user.profile?.avatarUrl || activeProfile.avatar,
          role: user.role as any,
          isVerified: true,
          aadhaarStatus: 'VERIFIED',
          guideLicenseStatus: user.role === 'GUIDE' ? 'VERIFIED' : 'NONE',
          walletBalance: user.wallet?.balance || activeProfile.walletBalance,
          rewardPoints: user.wallet?.rewardPoints || activeProfile.rewardPoints,
          gender: user.profile?.gender || activeProfile.gender,
          bio: user.profile?.bio || activeProfile.bio,
          languages: user.profile?.languages ? user.profile.languages.join(', ') : activeProfile.languages,
          travelStyles: user.profile?.travelStyle ? user.profile.travelStyle.join(', ') : activeProfile.travelStyles,
          emergencyContact: user.emergencyContacts?.[0]?.phoneNumber || activeProfile.emergencyContact,
          pushNotifications: user.profile?.pushNotifications !== undefined ? user.profile.pushNotifications : activeProfile.pushNotifications,
          locationSharing: user.profile?.locationSharing !== undefined ? user.profile.locationSharing : activeProfile.locationSharing,
          selectedLanguage: user.profile?.selectedLanguage || activeProfile.selectedLanguage,
        };
      }
    } catch (err) {
      console.warn('[Postgres DB Warn] Profile database update failed:', err);
    }
  }

  res.status(200).json({ status: 'success', data: activeProfile });
});

export default router;

import { Router, type Request } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { hashPassword, verifyPassword, validatePasswordStrength, MIN_PASSWORD_LENGTH } from '../../services/password';
import {
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  generateResetToken,
  hashResetToken,
  type SessionMeta,
} from '../../services/session';
import { isLockedOut, recordFailure, recordSuccess } from '../../services/login-attempts';
import { createAvatarUploadUrl, ObjectStorageNotConfiguredError } from '../../lib/object-storage';

const router = Router();

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

interface UserWithRelations {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  role: string;
  profile: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    gender: string | null;
    bio: string | null;
    languages: string[];
    travelStyle: string[];
    pushNotifications: boolean;
    locationSharing: boolean;
    selectedLanguage: string;
    verifiedBadge: boolean;
  } | null;
  wallet: { balance: number; rewardPoints: number } | null;
  emergencyContacts?: { phoneNumber: string }[];
  guideProfile?: { verifiedStatus: string } | null;
}

/** Single place that shapes a user row into the client-facing profile object. */
function toClientProfile(user: UserWithRelations) {
  return {
    id: user.id,
    name: user.profile
      ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
      : (user.email?.split('@')[0] ?? 'Traveler'),
    email: user.email ?? '',
    phoneNumber: user.phoneNumber ?? '',
    avatar: user.profile?.avatarUrl ?? DEFAULT_AVATAR,
    role: user.role,
    isVerified: user.profile?.verifiedBadge ?? false,
    // v1 does no identity/KYC verification (docs/REMEDIATION.md §12.1) — the
    // previous `aadhaarStatus` field is gone, not set to a fake value.
    guideLicenseStatus: user.guideProfile?.verifiedStatus ?? 'NONE',
    walletBalance: user.wallet?.balance ?? 0,
    rewardPoints: user.wallet?.rewardPoints ?? 0,
    gender: user.profile?.gender ?? '',
    bio: user.profile?.bio ?? '',
    emergencyContact: user.emergencyContacts?.[0]?.phoneNumber ?? '',
    languages: user.profile?.languages?.join(', ') ?? '',
    travelStyles: user.profile?.travelStyle?.join(', ') ?? '',
    pushNotifications: user.profile?.pushNotifications ?? true,
    locationSharing: user.profile?.locationSharing ?? false,
    selectedLanguage: user.profile?.selectedLanguage ?? 'English',
  };
}

const USER_INCLUDE = {
  profile: true,
  wallet: true,
  emergencyContacts: true,
  guideProfile: true,
} as const;

function requestMeta(req: Request): SessionMeta {
  const ua = req.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : undefined,
    ip: req.ip,
  };
}

// ── Register ────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the details you entered.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
  }

  const { name, email, password } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) {
    return res.status(400).json({ ok: false, error: { code: 'WEAK_PASSWORD', message: weak } });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Never issue a token from the registration path for an existing account.
      return res
        .status(409)
        .json({
          ok: false,
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'An account with this email already exists. Please sign in instead.',
          },
        });
    }

    const passwordHash = await hashPassword(password);
    const nameParts = name.split(' ');

    // Role is never taken from the request body — self-assigning GUIDE/ADMIN
    // is privilege escalation. Everyone starts as TOURIST.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'TOURIST',
        verificationStatus: 'NONE',
        profile: {
          create: {
            firstName: nameParts[0] ?? 'New',
            lastName: nameParts.slice(1).join(' ') || '',
            avatarUrl: DEFAULT_AVATAR,
            verifiedBadge: false,
          },
        },
        wallet: { create: { balance: 0, rewardPoints: 0 } },
      },
      include: USER_INCLUDE,
    });

    const accessToken = issueAccessToken({
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email ?? undefined,
    });
    const refreshToken = await issueRefreshToken(user.id, requestMeta(req));

    return res.status(201).json({
      ok: true,
      data: { token: accessToken, refreshToken, user: toClientProfile(user as unknown as UserWithRelations) },
    });
  } catch (err) {
    logger.error('[Auth] Registration failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Registration failed. Please try again.' } });
  }
});

// ── Login ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please enter a valid email and password.' } });
  }

  const { email, password } = parsed.data;

  if (await isLockedOut(email)) {
    return res
      .status(429)
      .json({
        ok: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts. Please try again in 15 minutes.' },
      });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: USER_INCLUDE,
    });

    // Same response for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate which emails are registered.
    const invalid = async () => {
      await recordFailure(email);
      return res
        .status(401)
        .json({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' } });
    };

    if (!user?.passwordHash) return await invalid();

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return await invalid();

    await recordSuccess(email);

    const accessToken = issueAccessToken({
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email ?? undefined,
    });
    const refreshToken = await issueRefreshToken(user.id, requestMeta(req));

    return res.status(200).json({
      ok: true,
      data: { token: accessToken, refreshToken, user: toClientProfile(user as unknown as UserWithRelations) },
    });
  } catch (err) {
    logger.error('[Auth] Login failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Sign in failed. Please try again.' } });
  }
});

// ── Refresh ─────────────────────────────────────────────────────────────────

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

router.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Missing refresh token.' } });
  }

  try {
    const result = await rotateRefreshToken(parsed.data.refreshToken, requestMeta(req));
    if (!result.ok) {
      return res
        .status(401)
        .json({
          ok: false,
          error: {
            code: result.reason === 'REUSED' ? 'REFRESH_TOKEN_REUSED' : 'REFRESH_TOKEN_INVALID',
            message: 'Your session has expired. Please sign in again.',
          },
        });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      include: USER_INCLUDE,
    });
    if (!user) {
      return res
        .status(401)
        .json({
          ok: false,
          error: { code: 'REFRESH_TOKEN_INVALID', message: 'Your session has expired. Please sign in again.' },
        });
    }

    const accessToken = issueAccessToken({
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email ?? undefined,
    });

    return res.status(200).json({
      ok: true,
      data: {
        token: accessToken,
        refreshToken: result.refreshToken,
        user: toClientProfile(user as unknown as UserWithRelations),
      },
    });
  } catch (err) {
    logger.error('[Auth] Refresh failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not refresh session.' } });
  }
});

// ── Logout ──────────────────────────────────────────────────────────────────

router.post('/logout', async (req, res) => {
  const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null;
  try {
    if (token) {
      await revokeRefreshToken(token);
    } else {
      await revokeAllUserSessions(requireUserId(req));
    }
    return res.status(200).json({ ok: true, data: { message: 'Signed out.' } });
  } catch (err) {
    logger.error('[Auth] Logout failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not sign out.' } });
  }
});

// ── Password reset ──────────────────────────────────────────────────────────

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  // Always report success — revealing whether an email is registered is an
  // account-enumeration leak.
  const genericOk = () =>
    res.status(200).json({ ok: true, data: { message: 'If that email is registered, a reset link has been sent.' } });

  if (!parsed.success) return genericOk();

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user) {
      const raw = generateResetToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(raw),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      // TODO(email): send this via a real provider. Until then the link is only
      // logged server-side so the flow is testable without leaking it to the client.
      logger.warn(`[Auth] Password reset token for ${user.email}: ${raw}`);
    }
    return genericOk();
  } catch (err) {
    logger.error('[Auth] Forgot-password failed:', err);
    return genericOk();
  }
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      });
  }

  const weak = validatePasswordStrength(parsed.data.password);
  if (weak) {
    return res.status(400).json({ ok: false, error: { code: 'WEAK_PASSWORD', message: weak } });
  }

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(parsed.data.token) },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return res
        .status(400)
        .json({
          ok: false,
          error: { code: 'RESET_TOKEN_INVALID', message: 'This reset link is invalid or has expired.' },
        });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // A password reset invalidates every existing session.
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return res.status(200).json({ ok: true, data: { message: 'Password updated. Please sign in.' } });
  } catch (err) {
    logger.error('[Auth] Reset-password failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not reset password.' } });
  }
});

// ── Profile ─────────────────────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  try {
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
    }
    return res.status(200).json({ ok: true, data: toClientProfile(user as unknown as UserWithRelations) });
  } catch (err) {
    logger.error('[Auth] Get profile failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load your profile.' } });
  }
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  avatar: z.string().url().max(2000).optional(),
  gender: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(500).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  emergencyContact: z.string().trim().max(30).optional(),
  languages: z.union([z.string(), z.array(z.string())]).optional(),
  travelStyles: z.union([z.string(), z.array(z.string())]).optional(),
  pushNotifications: z.boolean().optional(),
  locationSharing: z.boolean().optional(),
  selectedLanguage: z.string().trim().max(40).optional(),
});

function toStringArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

router.put('/profile', async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the details you entered.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
  }

  // `role` is deliberately absent from the schema: a client cannot change its
  // own role. Role changes are an admin action.
  const updates = parsed.data;

  try {
    const userId = requireUserId(req);

    if (updates.phoneNumber !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: { phoneNumber: updates.phoneNumber },
      });
    }

    const profileData: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      const parts = updates.name.split(' ');
      profileData.firstName = parts[0] ?? '';
      profileData.lastName = parts.slice(1).join(' ');
    }
    if (updates.avatar !== undefined) profileData.avatarUrl = updates.avatar;
    if (updates.gender !== undefined) profileData.gender = updates.gender;
    if (updates.bio !== undefined) profileData.bio = updates.bio;
    if (updates.pushNotifications !== undefined) profileData.pushNotifications = updates.pushNotifications;
    if (updates.locationSharing !== undefined) profileData.locationSharing = updates.locationSharing;
    if (updates.selectedLanguage !== undefined) profileData.selectedLanguage = updates.selectedLanguage;

    const languages = toStringArray(updates.languages);
    if (languages) profileData.languages = languages;
    const travelStyles = toStringArray(updates.travelStyles);
    if (travelStyles) profileData.travelStyle = travelStyles;

    if (Object.keys(profileData).length > 0) {
      await prisma.profile.update({ where: { userId }, data: profileData });
    }

    if (updates.emergencyContact !== undefined) {
      const contact = await prisma.emergencyContact.findFirst({ where: { userId } });
      if (contact) {
        await prisma.emergencyContact.update({
          where: { id: contact.id },
          data: { phoneNumber: updates.emergencyContact },
        });
      } else {
        await prisma.emergencyContact.create({
          data: {
            userId,
            name: 'Emergency SOS Contact',
            relation: 'SOS',
            phoneNumber: updates.emergencyContact,
          },
        });
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
    }
    return res.status(200).json({ ok: true, data: toClientProfile(user as unknown as UserWithRelations) });
  } catch (err) {
    logger.error('[Auth] Update profile failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not save your profile.' } });
  }
});

// ─── Avatar upload — docs/REMEDIATION.md §8.2 ────────────────────────────
// The picker result's local file:// (or blob:/data: on web) URI never
// leaves the device that took it — it isn't reachable by anyone else, or by
// this same user on a different device, and it doesn't survive a cache
// clear. This hands the client a short-lived presigned URL to PUT the bytes
// directly to the bucket (never through this server — a photo doesn't
// belong in our request/response cycle), plus the public URL it will be
// readable at afterwards. The client then calls PUT /profile with that
// public URL exactly like it does today with a preset avatar or an
// Unsplash URL.
const avatarUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

router.post('/avatar-upload-url', async (req, res) => {
  const parsed = avatarUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'contentType must be image/jpeg, image/png, or image/webp.' },
      });
  }

  try {
    const userId = requireUserId(req);
    const { uploadUrl, publicUrl } = await createAvatarUploadUrl(userId, parsed.data.contentType);
    return res.status(200).json({ ok: true, data: { uploadUrl, publicUrl } });
  } catch (err) {
    if (err instanceof ObjectStorageNotConfiguredError) {
      // Per the 2026-08-27 decision: no fake fallback. Report this
      // honestly rather than accepting the request and quietly discarding
      // the photo — the client shows this as "photo upload isn't set up
      // yet" rather than silently keeping a local-only avatar.
      return res
        .status(503)
        .json({
          ok: false,
          error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo upload is not available right now.' },
        });
    }
    logger.error('[Auth] Avatar upload URL failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not start the upload.' } });
  }
});

// ─── Data export (right to access) — docs/REMEDIATION.md §12.4 ──────────
// Returns everything the service holds about the caller, as JSON. No
// passwordHash, no other users' data.
router.get('/export', async (req, res) => {
  try {
    const userId = requireUserId(req);
    const [
      user,
      organizedTrips,
      memberships,
      joinRequests,
      messagesSent,
      expensesPaid,
      sosAlerts,
      emergencyContacts,
      notifications,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, include: { profile: true, wallet: true, guideProfile: true } }),
      prisma.trip.findMany({ where: { creatorId: userId } }),
      prisma.tripMember.findMany({ where: { userId }, include: { trip: { select: { id: true, name: true } } } }),
      prisma.joinRequest.findMany({ where: { userId } }),
      prisma.message.findMany({
        where: { senderId: userId },
        select: { id: true, content: true, chatRoomId: true, createdAt: true },
      }),
      prisma.tripExpense.findMany({ where: { paidById: userId } }),
      prisma.sOSAlert.findMany({ where: { userId } }),
      prisma.emergencyContact.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
    ]);

    if (!user) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
    }

    const safeUser: Record<string, unknown> = { ...user };
    delete safeUser.passwordHash;
    res.setHeader('Content-Disposition', 'attachment; filename="travelstar-data-export.json"');
    return res.status(200).json({
      ok: true,
      data: {
        exportedAt: new Date().toISOString(),
        account: safeUser,
        organizedTrips,
        memberships,
        joinRequests,
        messagesSent,
        expensesPaid,
        sosAlerts,
        emergencyContacts,
        notifications,
      },
    });
  } catch (err) {
    logger.error('[Auth] Data export failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not build your data export.' } });
  }
});

// ─── Account deletion (right to erasure) — docs/REMEDIATION.md §12.4 ────
// Mandatory for both app stores. Requires the current password (a
// deliberate, authenticated action), revokes every session, and hard-
// deletes the user. Trips they organise are deleted too (Trip.creatorId
// is RESTRICT, and cascading TripMember/ChatRoom/JoinRequest/... off the
// trip is the correct erasure behaviour). Everything else cascades off
// User via onDelete: Cascade.
const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
});

router.post('/delete-account', async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Enter your password to confirm deletion.' } });
  }
  try {
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
    }
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) {
      return res
        .status(401)
        .json({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password.' } });
    }

    await revokeAllUserSessions(userId);
    await prisma.$transaction([
      prisma.trip.deleteMany({ where: { creatorId: userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    logger.info('[Auth] Account deleted', { userId });
    return res.status(200).json({ ok: true, data: { deleted: true } });
  } catch (err) {
    logger.error('[Auth] Account deletion failed:', err);
    return res
      .status(500)
      .json({
        ok: false,
        error: { code: 'INTERNAL', message: 'Could not delete your account. Please contact support.' },
      });
  }
});

export default router;

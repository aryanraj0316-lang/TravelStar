import { Router, type Request } from 'express';
import { z } from 'zod';
import { remoteMediaUrl } from '../../lib/validators';
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
import { normalizeIndianMobile, INDIAN_MOBILE_ERROR } from '../../lib/indian-phone';
import { sendEmail } from '../../services/email';
import crypto from 'node:crypto';
import { createAvatarUploadUrl, getMissingObjectStorageVars, ObjectStorageNotConfiguredError } from '../../lib/object-storage';

const router = Router();


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
    sosAudienceMode: 'TRIP_GROUP' | 'NEARBY';
    sosRadiusKm: number;
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
    avatar: user.profile?.avatarUrl ?? '',
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
    // How far this user's own SOS reaches (Profile.sosAudienceMode).
    sosAudienceMode: user.profile?.sosAudienceMode ?? 'TRIP_GROUP',
    sosRadiusKm: user.profile?.sosRadiusKm ?? 5,
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
  // Required: the mobile number is what an account signs in with. Normalised
  // to +91XXXXXXXXXX so every spelling of the same number is one number.
  phoneNumber: z
    .string()
    .transform((v, ctx) => {
      const normalized = normalizeIndianMobile(v);
      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: INDIAN_MOBILE_ERROR });
        return z.NEVER;
      }
      return normalized;
    }),
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

  const { name, email, phoneNumber, password } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) {
    return res.status(400).json({ ok: false, error: { code: 'WEAK_PASSWORD', message: weak } });
  }

  try {
    const phoneTaken = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
    if (phoneTaken) {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'An account with this mobile number already exists. Please log in instead.',
        },
      });
    }

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
        phoneNumber,
        passwordHash,
        role: 'TOURIST',
        verificationStatus: 'NONE',
        profile: {
          create: {
            firstName: nameParts[0] ?? 'New',
            lastName: nameParts.slice(1).join(' ') || '',
            avatarUrl: null,
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

// Mobile number only — email is no longer a way to sign in.
const loginSchema = z.object({
  phoneNumber: z.string().min(1).max(30),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please enter your mobile number and password.' } });
  }

  const phoneNumber = normalizeIndianMobile(parsed.data.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: INDIAN_MOBILE_ERROR } });
  }
  const { password } = parsed.data;

  if (await isLockedOut(phoneNumber)) {
    return res
      .status(429)
      .json({
        ok: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts. Please try again in 15 minutes.' },
      });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: USER_INCLUDE,
    });

    // Same response for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate which numbers are registered.
    const invalid = async () => {
      await recordFailure(phoneNumber);
      return res
        .status(401)
        .json({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect mobile number or password.' } });
    };

    if (!user?.passwordHash) return await invalid();

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return await invalid();

    await recordSuccess(phoneNumber);

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

// ── Password reset: 6-digit code emailed to the account's address ──────────

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** "ra***@gmail.com" — enough to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(3, local.length - head.length))}@${domain}`;
}

/**
 * The code's hash is salted with its own row id. tokenHash is unique, and a
 * 6-digit code has only a million values, so two users would otherwise
 * collide on the same hash — and an unsalted hash of so small a space is
 * trivially reversible anyway.
 */
function hashOtp(rowId: string, otp: string): string {
  return hashResetToken(`${rowId}:${otp}`);
}

const forgotSchema = z.object({ phoneNumber: z.string().min(1).max(30) });

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  const phoneNumber = parsed.success ? normalizeIndianMobile(parsed.data.phoneNumber) : null;
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: INDIAN_MOBILE_ERROR } });
  }

  const genericOk = (extra: Record<string, unknown> = {}) =>
    res.status(200).json({
      ok: true,
      data: {
        message: 'If this number is registered, a verification code has been sent to its email.',
        ...extra,
      },
    });

  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: { profile: true },
    });
    if (!user?.email) return genericOk();

    // One code at a time, and not re-sent faster than once a minute.
    const latest = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000,
      );
      return genericOk({ maskedEmail: maskEmail(user.email), retryAfterSeconds });
    }

    // Any earlier unused code stops working the moment a new one is issued.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const rowId = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        id: rowId,
        userId: user.id,
        tokenHash: hashOtp(rowId, otp),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const firstName = user.profile?.firstName || 'there';
    const { sent } = await sendEmail({
      to: user.email,
      toName: firstName,
      subject: 'Your Yatrenzo password reset code',
      text:
        `Hi ${firstName},\n\nYour Yatrenzo password reset code is ${otp}.\n` +
        `It expires in 10 minutes. If you did not request this, you can ignore this email.\n`,
      html:
        `<p>Hi ${firstName},</p>` +
        `<p>Your Yatrenzo password reset code is:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>` +
        `<p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    });
    if (!sent) {
      // Brevo not configured yet (or it failed): keep the flow testable
      // without ever sending the code back to the client.
      logger.warn(`[Auth] Password reset code for ${user.email}: ${otp}`);
    }

    return genericOk({ maskedEmail: maskEmail(user.email), retryAfterSeconds: 60 });
  } catch (err) {
    logger.error('[Auth] Forgot-password failed:', err);
    return genericOk();
  }
});

const resetSchema = z.object({
  phoneNumber: z.string().min(1).max(30),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    const otpIssue = parsed.error.issues.find((i) => i.path[0] === 'otp');
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: otpIssue ? otpIssue.message : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
    });
  }

  const phoneNumber = normalizeIndianMobile(parsed.data.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: INDIAN_MOBILE_ERROR } });
  }

  const weak = validatePasswordStrength(parsed.data.password);
  if (weak) {
    return res.status(400).json({ ok: false, error: { code: 'WEAK_PASSWORD', message: weak } });
  }

  const invalidCode = (message = 'That code is incorrect or has expired. Request a new one.') =>
    res.status(400).json({ ok: false, error: { code: 'OTP_INVALID', message } });

  try {
    const user = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
    if (!user) return invalidCode();

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= OTP_MAX_ATTEMPTS) {
      return invalidCode('This code has expired or been used too many times. Request a new one.');
    }

    const expected = Buffer.from(record.tokenHash, 'hex');
    const given = Buffer.from(hashOtp(record.id, parsed.data.otp), 'hex');
    const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);

    if (!matches) {
      const updated = await prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const left = OTP_MAX_ATTEMPTS - updated.attempts;
      return invalidCode(
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Too many incorrect attempts. Request a new code.',
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // A password reset invalidates every existing session.
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return res.status(200).json({ ok: true, data: { message: 'Password updated. Please log in.' } });
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
  // The login response echoes '' for a user with no avatar (toClientProfile
  // below), and auth.tsx's login handler currently sends that whole object
  // straight back through this route — so '' has to mean "no change",
  // exactly like an absent key, rather than failing remoteMediaUrl's URL
  // check. Preprocessing to undefined runs before that check, so an empty
  // string never reaches it.
  avatar: z.preprocess((val) => (val === '' ? undefined : val), remoteMediaUrl.optional()),
  gender: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(500).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  emergencyContact: z.string().trim().max(30).optional(),
  languages: z.union([z.string(), z.array(z.string())]).optional(),
  travelStyles: z.union([z.string(), z.array(z.string())]).optional(),
  pushNotifications: z.boolean().optional(),
  locationSharing: z.boolean().optional(),
  selectedLanguage: z.string().trim().max(40).optional(),
  sosAudienceMode: z.enum(['TRIP_GROUP', 'NEARBY']).optional(),
  // Capped at the same MAX_SOS_RADIUS_KM the resolver enforces, so an
  // out-of-range value is rejected here rather than silently clamped later.
  sosRadiusKm: z.coerce.number().int().min(1).max(50).optional(),
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
      // This is the number the account signs in with, so it can be changed
      // but never cleared, and only to a valid Indian mobile no one else
      // holds — anything else would lock the owner out of their account.
      const phoneNumber = normalizeIndianMobile(updates.phoneNumber);
      if (!phoneNumber) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_PHONE', message: INDIAN_MOBILE_ERROR } });
      }
      const holder = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
      if (holder && holder.id !== userId) {
        return res.status(409).json({
          ok: false,
          error: { code: 'PHONE_ALREADY_REGISTERED', message: 'This mobile number is already used by another account.' },
        });
      }
      await prisma.user.update({ where: { id: userId }, data: { phoneNumber } });
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
    if (updates.sosAudienceMode !== undefined) profileData.sosAudienceMode = updates.sosAudienceMode;
    if (updates.sosRadiusKm !== undefined) profileData.sosRadiusKm = updates.sosRadiusKm;

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
      //
      // TEMPORARY DIAGNOSTIC — remove before merging. Names exactly which
      // OBJECT_STORAGE_* vars are undefined at runtime, instead of the
      // generic message, to debug a deployed environment where the vars
      // are set in the dashboard but the process isn't seeing them.
      const missing = getMissingObjectStorageVars();
      return res
        .status(503)
        .json({
          ok: false,
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: `Photo upload is not available right now. Missing: ${missing.join(', ')}.`,
          },
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

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from './db';
import { env } from '../config/env';

export interface AccessTokenClaims {
  id: string;
  userId: string;
  role: string;
  email?: string | undefined;
}

export interface SessionMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export function issueAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueRefreshToken(
  userId: string,
  meta: SessionMeta
): Promise<string> {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(
    Date.now() + env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });

  return raw;
}

export type RefreshResult =
  | { ok: true; userId: string; refreshToken: string }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'REUSED' };

/**
 * Rotates a refresh token. On reuse of an already-revoked token, every session
 * for that user is revoked — a replayed token means the token was captured, and
 * we cannot tell the attacker's session from the victim's.
 */
export async function rotateRefreshToken(
  rawToken: string,
  meta: SessionMeta
): Promise<RefreshResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const session = await prisma.session.findUnique({ where: { tokenHash } });

  if (!session) {
    return { ok: false, reason: 'INVALID' };
  }

  if (session.revokedAt) {
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: 'REUSED' };
  }

  if (session.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const nextToken = await issueRefreshToken(session.userId, meta);
  return { ok: true, userId: session.userId, refreshToken: nextToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function hashResetToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

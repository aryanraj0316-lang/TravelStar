import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

// Paths under the mount point (/api/v1) that never require a token, for any
// HTTP method. Keep this to the auth bootstrap endpoints only — everything
// that reads or writes user data belongs in PUBLIC_GET below (if it's a
// public read) or nowhere (if it must be authenticated).
const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
]);

// GET-only routes that show content anyone can browse without an account
// (trip listings, guide listings, destinations, weather, hazard alerts, the
// public feed). The client calls several of these unconditionally on the
// home screen regardless of login state, so gating them behind auth would
// break the app's actual browse-before-login design — see
// docs/REMEDIATION.md §2.4, which only lists the auth endpoints explicitly,
// but the existing client (src/store/AppContext.tsx) already assumes these
// are reachable while logged out.
//
// Every mutating endpoint, and every endpoint that returns one user's private
// data (profile, wallet, notifications, chats, guide earnings, etc.), is
// deliberately absent from both lists and stays behind a required token.
const PUBLIC_GET_EXACT = new Set([
  '/trips',
  '/trips/nearby',
  '/guides',
  '/destinations',
  '/weather',
  '/weather/live',
  '/alerts',
  '/feed',
  '/stories',
  '/safety/monsoon-advisory',
]);

const PUBLIC_GET_PATTERNS = [
  /^\/trips\/[^/]+$/, // /trips/:id — but not /trips/:id/members or deeper
  /^\/guides\/[^/]+\/packages$/, // /guides/:id/packages
  /^\/guides\/[^/]+\/reels$/, // /guides/:id/reels
];

function isPublicRoute(req: Request): boolean {
  if (PUBLIC_PATHS.has(req.path)) return true;
  if (req.method !== 'GET') return false;
  if (PUBLIC_GET_EXACT.has(req.path)) return true;
  return PUBLIC_GET_PATTERNS.some((re) => re.test(req.path));
}

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const isPublic = isPublicRoute(req);
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

  if (!token) {
    if (isPublic) {
      next();
      return;
    }
    res.status(401).json({ status: 'error', message: 'Unauthorized: Missing token' });
    return;
  }

  jwt.verify(token, env.JWT_SECRET, (err, decoded: jwt.JwtPayload | string | undefined) => {
    if (err || typeof decoded !== 'object' || !decoded) {
      // On a public route, an invalid/expired token degrades to an anonymous
      // request rather than a hard failure — the caller is still allowed to
      // browse, just without the personalization a valid token would add.
      if (isPublic) {
        next();
        return;
      }
      res.status(403).json({ status: 'error', message: 'Forbidden: Invalid or expired token' });
      return;
    }
    req.user = {
      id: decoded.id || decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  });
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized: User not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden: Restricted to roles [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
};

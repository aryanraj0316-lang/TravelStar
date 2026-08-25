import type { Request } from 'express';

/**
 * The authenticated user's id, as established by `authenticateJWT`.
 *
 * Every route under /api/v1 that is not on the public allowlist runs behind that
 * middleware, so `req.user` is always populated here. This throws rather than
 * returning null on purpose: there is no legitimate "fall back to some other
 * user" path, and the old helpers that returned null are what allowed
 * unauthenticated requests to act as the first user in the database.
 */
export function requireUserId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new Error('requireUserId called on an unauthenticated request');
  }
  return id;
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === 'ADMIN';
}

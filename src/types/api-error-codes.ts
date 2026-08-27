// Client copy of backend/src/types/api-error-codes.ts. Kept in sync by hand —
// there is no monorepo/shared-package tooling in this project (Phase 6.4 flags
// this as the follow-up: either a shared workspace of zod schemas, or an
// OpenAPI-generated client, so this stops being two files that can drift).
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DESTINATION_NOT_FOUND'
  | 'BUSINESS_RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'ACCOUNT_LOCKED'
  | 'APPROVAL_REQUIRED'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'GUIDE_PROFILE_EXISTS'
  | 'GUIDE_PROFILE_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'PACKAGE_NOT_FOUND'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_REUSED'
  | 'RESET_TOKEN_INVALID'
  | 'SESSION_REVOKED'
  | 'TRIP_FULL'
  | 'TRIP_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'WEAK_PASSWORD'
  | 'STORAGE_UNAVAILABLE'
  // Client-only codes for failures that never reach the server.
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
  meta?: { cursor?: string; total?: number };
}

export interface ApiErrorEnvelope {
  ok: false;
  error: { code: ApiErrorCode; message: string; details?: unknown; requestId?: string };
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

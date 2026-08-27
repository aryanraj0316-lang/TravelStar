// Single source of truth for API error codes (REMEDIATION.md §0.2.1 / CONVENTIONS.md §2).
// The client copy lives at src/types/api-error-codes.ts and MUST be kept in sync —
// see Phase 6.4 for the plan to replace this manual duplication with a generated
// or shared-package source of truth.
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
  | 'STORAGE_UNAVAILABLE';

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

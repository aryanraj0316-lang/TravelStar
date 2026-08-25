import { Response } from 'express';
import { ApiErrorCode } from '../types/api-error-codes';

// Thrown by route handlers / services to signal a specific HTTP status and
// error code. Caught centrally by middleware/error.ts. Prefer this over
// hand-building { ok: false, error } response bodies in new code.
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function sendOk<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: { cursor?: string; total?: number }
): void {
  res.status(statusCode).json(meta ? { ok: true, data, meta } : { ok: true, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
): void {
  res
    .status(statusCode)
    .json({ ok: false, error: details !== undefined ? { code, message, details } : { code, message } });
}

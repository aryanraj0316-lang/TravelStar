import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { ApiError } from '../lib/http';
import { ApiErrorCode } from '../types/api-error-codes';

function fromKnownError(err: unknown): { statusCode: number; code: ApiErrorCode; message: string; details?: unknown } {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found.' };
    if (err.code === 'P2002') return { statusCode: 409, code: 'CONFLICT', message: 'Resource already exists.' };
  }
  return { statusCode: 500, code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}

// Registered last in app.ts. Catches every rejected promise from a route
// handler (express-async-errors patches the router so async throws land
// here) plus anything passed to next(err) explicitly. Never leaks a stack
// trace outside development, and every response carries the request ID that
// was already attached by middleware/request-id.ts so a user-reported error
// can be traced to server logs.
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const { statusCode, code, message, details } = fromKnownError(err);

  if (statusCode >= 500) {
    logger.error(`[${req.id}] ${req.method} ${req.originalUrl} ->`, err instanceof Error ? err.stack ?? err.message : err);
  } else {
    logger.warn(`[${req.id}] ${req.method} ${req.originalUrl} -> ${statusCode} ${code}`);
  }

  res.status(statusCode).json({
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: req.id,
    },
  });
};

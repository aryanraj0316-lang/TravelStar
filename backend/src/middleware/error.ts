import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

interface HttpError extends Error {
  statusCode?: number;
}

function isHttpError(err: unknown): err is HttpError {
  return err instanceof Error;
}

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const httpError: HttpError = isHttpError(err) ? err : new Error('Internal Server Error');
  logger.error(httpError.stack);

  const statusCode = httpError.statusCode || 500;
  const message = httpError.message || 'Internal Server Error';

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    stack: process.env.NODE_ENV === 'development' ? httpError.stack : undefined,
  });
};

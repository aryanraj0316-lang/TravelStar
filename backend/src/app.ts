import 'express-async-errors';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

dotenv.config();

import { env } from './config/env';
import prisma from './services/db';
import { authenticateJWT } from './middleware/auth';
import { requestId } from './middleware/request-id';
import authRoutes from './api/routes/auth';
import guideRoutes from './api/routes/guides';
import safetyRoutes from './api/routes/safety';
import storyRoutes from './api/routes/stories';
import tripRoutes from './api/routes/trips';
import notificationRoutes from './api/routes/notifications';
import destinationRoutes from './api/routes/destinations';
import weatherRoutes from './api/routes/weather';
import alertRoutes from './api/routes/alerts';
import interactionRoutes from './api/routes/interactions';
import chatRoutes from './api/routes/chats';
import feedRoutes from './api/routes/feed';
import { errorHandler } from './middleware/error';

const app = express();

// Trust the proxy so req.ip is the real client address behind a load balancer —
// per-IP rate limiting is meaningless without this.
app.set('trust proxy', 1);

app.use(requestId);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    noSniff: true,
    frameguard: { action: 'deny' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, native apps) which send no Origin.
      if (!origin) return callback(null, true);
      if (env.CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      // Expo's web dev server picks whatever port is free, so a fixed list of
      // dev ports is too brittle to be useful — allow any localhost origin in
      // development only. Production still requires an exact match above.
      if (env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }
      const corsError: Error & { statusCode?: number } = new Error('Not allowed by CORS');
      corsError.statusCode = 403;
      return callback(corsError);
    },
    credentials: true,
  })
);

// JSON endpoints do not need 10mb. Media uploads get their own limit when
// those routes exist (Phase 8).
// Gzip/deflate JSON responses (docs/REMEDIATION.md Phase 10). Trip and chat
// payloads are highly compressible text and the app is used on Indian mobile
// networks, where bytes on the wire dominate response time. `threshold` skips
// the CPU cost on small bodies where a compressed frame can be larger than
// the original.
app.use(compression({ threshold: 1024 }));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// ── Rate limits ─────────────────────────────────────────────────────────────

// Integration tests exercise register/login/SOS far more densely than any
// real client would in the same window (many independent test cases, all
// from the same in-process IP), so the strict per-route limits below would
// otherwise fail tests on request volume rather than on the behavior being
// tested. The global limiter stays active even in tests — 1000/15min is
// generous enough not to interfere.
const skipInTest = () => env.NODE_ENV === 'test';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: skipInTest,
  // Limit per IP *and* per email so one attacker cannot spray many accounts
  // from one IP, nor one account from many IPs.
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${req.ip}:${email}`;
  },
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  skip: skipInTest,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many accounts created from this address.' } },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: skipInTest,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many reset requests. Please try again later.' } },
});

const sosLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: skipInTest,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many SOS alerts raised.' } },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  skip: (req) => skipInTest() || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});

app.use('/api/', globalLimiter);

app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/forgot-password', passwordResetLimiter);
app.use('/api/v1/auth/reset-password', passwordResetLimiter);

// Authenticate everything under /api/v1 by default. The public allowlist lives
// in the middleware itself, so no route can silently opt out of auth.
app.use('/api/v1', authenticateJWT);

app.use('/api/v1/safety/sos', sosLimiter);
app.use('/api/v1', writeLimiter);

// ── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/guides', guideRoutes);
app.use('/api/v1/safety', safetyRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/destinations', destinationRoutes);
app.use('/api/v1/weather', weatherRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/interactions', interactionRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/feed', feedRoutes);

// Liveness — no dependencies. If the process is up, this returns 200.
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, data: { status: 'ok', service: 'TravelStar Backend', timestamp: new Date().toISOString() } });
});

// Readiness — checks the dependencies the app needs to serve traffic
// (docs/REMEDIATION.md Phase 11). Returns 503 while the DB is unreachable
// so a load balancer stops routing to this instance.
app.get('/ready', async (req, res) => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }
  const ready = Object.values(checks).every((c) => c === 'ok');
  res.status(ready ? 200 : 503).json({ ok: ready, data: { ready, checks } });
});

app.use('/api/v1', (req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
});

app.use(errorHandler);

export default app;

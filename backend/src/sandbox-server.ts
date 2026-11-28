import 'dotenv/config';
import 'express-async-errors';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { validateSandboxRuntime } from './lib/sandbox-config';

// This is a separate deployment entry point. The production app/server and its
// refusal of sandbox keys are unchanged. Never mount the normal public app here.
validateSandboxRuntime(process.env);
// Require only after isolation checks, before any connection can be made.
const { env } = require('./config/env') as typeof import('./config/env');
const prisma = (require('./services/db') as typeof import('./services/db')).default;
const paymentRouter = (require('./api/routes/trip-payments') as typeof import('./api/routes/trip-payments')).default;
const { applyPendingMigrations } = require('./lib/auto-migrate') as typeof import('./lib/auto-migrate');

const app = express();
app.set('env', 'production');
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, environment: 'sandbox', payments: 'test-only' });
});
app.use(express.json({ limit: '256kb', verify: (req, _res, body) => {
  (req as express.Request).rawBody = body.toString('utf8');
} }));
app.use('/api/v1/trip-payments', (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/webhook') {
    res.status(404).json({ ok: false });
    return;
  }
  next();
}, paymentRouter);
app.use((_req, res) => { res.status(404).json({ ok: false }); });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[sandbox] Request failed', error instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR');
  res.status(error instanceof SyntaxError ? 400 : 500).json({ ok: false });
});

const server = http.createServer(app);
void applyPendingMigrations({ force: true }).then(async migrated => {
  if (!migrated) throw new Error('Sandbox migrations failed');
  await prisma.$connect();
  server.listen(env.PORT, () => console.log('[sandbox] Test-only webhook receiver ready'));
}).catch(() => { console.error('[sandbox] Startup failed'); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10_000).unref();
});

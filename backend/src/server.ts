import http from 'http';
import app from './app';
import prisma from './services/db';
import { logger } from './lib/logger';
import { env } from './config/env';
import { createSocketServer } from './socket-server';
import { initObservability, captureException, flushObservability } from './lib/observability';
import { closeCache } from './lib/cache';

initObservability();

const server = http.createServer(app);
const io = createSocketServer(server);

app.set('socketio', io);

server.listen(env.PORT, () => {
  logger.info(`TravelStar server is running on port ${env.PORT}`);
});

// ── Graceful shutdown (docs/REMEDIATION.md Phase 11) ────────────────
// SIGTERM (orchestrator stop) / SIGINT (Ctrl-C): stop accepting new
// connections, close sockets, disconnect Prisma, flush error reporting,
// then exit. A hard timeout guards against a hung drain.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[shutdown] received ${signal}, draining…`);

  const hardExit = setTimeout(() => {
    logger.error('[shutdown] drain timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  hardExit.unref();

  try {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
    await prisma.$disconnect();
    await closeCache();
    await flushObservability();
    logger.info('[shutdown] clean exit');
    clearTimeout(hardExit);
    process.exit(0);
  } catch (e) {
    logger.error('[shutdown] error during drain', e);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('[process] unhandledRejection', reason);
  captureException(reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[process] uncaughtException', err);
  captureException(err);
  // An uncaught exception leaves the process in an undefined state — let
  // the supervisor restart it rather than limping on.
  void shutdown('uncaughtException');
});

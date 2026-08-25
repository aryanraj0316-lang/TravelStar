import http from 'http';
import app from './app';
import { logger } from './lib/logger';
import { env } from './config/env';
import { createSocketServer } from './socket-server';

const server = http.createServer(app);
const io = createSocketServer(server);

app.set('socketio', io);

server.listen(env.PORT, () => {
  logger.log(`TravelStar server is running on port ${env.PORT}`);
});

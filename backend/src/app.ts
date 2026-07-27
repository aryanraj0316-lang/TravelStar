import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import authRoutes from './api/routes/auth';
import guideRoutes from './api/routes/guides';
import paymentRoutes from './api/routes/payments';
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

dotenv.config();

const app = express();

// Secure headers
app.use(helmet());

// Enable CORS for mobile and web apps
app.use(cors({
  origin: '*',
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter: prevent brute force & DOS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api/', limiter);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/guides', guideRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/safety', safetyRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/destinations', destinationRoutes);
app.use('/api/v1/weather', weatherRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/interactions', interactionRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/feed', feedRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'TravelConnect Backend', timestamp: new Date() });
});

// Global Error Handler middleware
app.use(errorHandler);

export default app;

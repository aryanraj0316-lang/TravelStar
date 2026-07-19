import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './api/routes/auth';
import tripRoutes from './api/routes/trips';
import guideRoutes from './api/routes/guides';
import paymentRoutes from './api/routes/payments';
import safetyRoutes from './api/routes/safety';
import { errorHandler } from './middleware/error';

dotenv.config();

const app = express();

// Secure headers
app.use(helmet());

// Enable CORS
app.use(cors({
  origin: '*', // Customize in production
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter: prevent brute force & DOS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api/', limiter);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/guides', guideRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/safety', safetyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Global Error Handler middleware
app.use(errorHandler);

export default app;

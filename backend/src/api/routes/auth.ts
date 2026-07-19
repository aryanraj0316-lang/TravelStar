import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_12345';

// Mock DB users
const mockUsers = [
  { id: '1', email: 'tourist@example.com', role: 'TOURIST', verified: true },
  { id: '2', email: 'guide@example.com', role: 'GUIDE', verified: false },
];

router.post('/register', (req, res) => {
  const { email, password, role } = req.body;
  const newUser = {
    id: `user-${Date.now()}`,
    email,
    role: role || 'TOURIST',
    verified: false,
  };
  
  const token = jwt.sign(newUser, JWT_SECRET, { expiresIn: '24h' });
  res.status(201).json({
    status: 'success',
    token,
    user: newUser,
  });
});

router.post('/login', (req, res) => {
  const { email } = req.body;
  const user = mockUsers.find((u) => u.email === email) || {
    id: 'user-default',
    email: email || 'user@example.com',
    role: 'TOURIST',
    verified: true,
  };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
  res.status(200).json({
    status: 'success',
    token,
    user,
  });
});

router.post('/verify-otp', (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  if (otpCode !== '123456') {
    return res.status(400).json({ status: 'error', message: 'Invalid OTP code' });
  }

  const user = { id: 'user-otp', phoneNumber, role: 'TOURIST', verified: true };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });

  res.status(200).json({
    status: 'success',
    token,
    user,
  });
});

export default router;

import { Router } from 'express';

const router = Router();

const guides = [
  {
    id: 'guide-1',
    name: 'Rajesh Kumar',
    rating: 4.9,
    languages: ['Hindi', 'English'],
    dailyRate: 2200,
    expertise: ['Vrindavan', 'Agra'],
  },
];

router.get('/', (req, res) => {
  res.status(200).json({ status: 'success', data: guides });
});

router.post('/packages', (req, res) => {
  const { title, description, price, durationDays } = req.body;
  const newPackage = {
    id: `pkg-${Date.now()}`,
    title,
    description,
    price: parseFloat(price) || 1000,
    durationDays: parseInt(durationDays) || 1,
  };
  res.status(201).json({ status: 'success', data: newPackage });
});

router.post('/availability', (req, res) => {
  const { availableDays } = req.body; // e.g. ['Monday', 'Wednesday', 'Friday']
  res.status(200).json({
    status: 'success',
    message: 'Availability calendar updated successfully',
    calendar: availableDays,
  });
});

export default router;

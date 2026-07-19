import { Router } from 'express';

const router = Router();

router.post('/book', (req, res) => {
  const { type, targetId, amount } = req.body;
  const bookingId = `book-${Date.now()}`;
  const razorpayOrderId = `order_${Math.random().toString(36).substring(2, 15)}`;

  res.status(201).json({
    status: 'success',
    bookingId,
    amount,
    type,
    razorpayOrderId,
    message: 'Booking created. Awaiting payment signature verification.',
  });
});

router.post('/verify', (req, res) => {
  const { bookingId, paymentId, signature } = req.body;
  
  // Signature checks (Razorpay/Stripe signature logic mock)
  if (!signature) {
    return res.status(400).json({ status: 'error', message: 'Missing payment signature verification' });
  }

  res.status(200).json({
    status: 'success',
    paymentStatus: 'SUCCESS',
    bookingId,
    paymentId,
    gstInvoiceId: `GST-${Date.now()}`,
    message: 'Payment verified. GST invoice generated and sent to email.',
  });
});

router.post('/split-expense', (req, res) => {
  const { amount, membersCount } = req.body;
  const splitAmount = Math.round(amount / (membersCount || 1));

  res.status(200).json({
    status: 'success',
    totalAmount: amount,
    splitAmount,
    message: `Split calculated. Each of the ${membersCount} members owes ₹${splitAmount}.`,
  });
});

export default router;

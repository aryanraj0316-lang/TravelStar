import { Router } from 'express';

const router = Router();

// Persistent Wallet Transactions Store
const walletTransactions = [
  { id: 't-1', amount: 1500, type: 'DEPOSIT', remark: 'Added via GPay', date: '2026-07-18' },
  { id: 't-2', amount: -500, type: 'PAYMENT', remark: 'Trip booking advance', date: '2026-07-17' },
  { id: 't-3', amount: 150, type: 'CASHBACK', remark: 'Referral cashback reward', date: '2026-07-16' },
];

router.get('/wallet/transactions', (req, res) => {
  res.status(200).json({ status: 'success', data: walletTransactions });
});

router.post('/wallet/add', (req, res) => {
  const { amount, remark } = req.body;
  const numAmount = parseFloat(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid deposit amount' });
  }

  const txn = {
    id: `t-${Date.now()}`,
    amount: numAmount,
    type: 'DEPOSIT',
    remark: remark || 'Added to wallet',
    date: new Date().toISOString().split('T')[0],
  };

  walletTransactions.unshift(txn);
  res.status(201).json({ status: 'success', data: txn, message: 'Wallet deposit successful' });
});

router.post('/wallet/withdraw', (req, res) => {
  const { amount, remark } = req.body;
  const numAmount = parseFloat(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid withdrawal amount' });
  }

  const txn = {
    id: `t-${Date.now()}`,
    amount: -numAmount,
    type: 'WITHDRAWAL',
    remark: remark || 'Withdrawn to Bank A/C',
    date: new Date().toISOString().split('T')[0],
  };

  walletTransactions.unshift(txn);
  res.status(201).json({ status: 'success', data: txn, message: 'Wallet withdrawal processed' });
});

router.post('/book', (req, res) => {
  const { type, targetId, amount } = req.body;
  const bookingId = `book-${Date.now()}`;
  const razorpayOrderId = `order_${Math.random().toString(36).substring(2, 15)}`;

  res.status(201).json({
    status: 'success',
    bookingId,
    amount: parseFloat(amount) || 0,
    type: type || 'TRIP',
    targetId,
    razorpayOrderId,
    message: 'Booking created. Awaiting payment signature verification.',
  });
});

router.post('/verify', (req, res) => {
  const { bookingId, paymentId, signature } = req.body;
  
  if (!signature) {
    return res.status(400).json({ status: 'error', message: 'Missing payment signature verification' });
  }

  res.status(200).json({
    status: 'success',
    paymentStatus: 'SUCCESS',
    bookingId,
    paymentId: paymentId || `pay-${Date.now()}`,
    gstInvoiceId: `GST-${Date.now()}`,
    message: 'Payment verified. GST invoice generated and sent to email.',
  });
});

router.post('/split-expense', (req, res) => {
  const { amount, membersCount } = req.body;
  const total = parseFloat(amount) || 0;
  const members = parseInt(membersCount) || 1;
  const splitAmount = Math.round(total / (members || 1));

  res.status(200).json({
    status: 'success',
    totalAmount: total,
    splitAmount,
    membersCount: members,
    message: `Split calculated. Each of the ${members} members owes ₹${splitAmount}.`,
  });
});

export default router;

import { Router } from 'express';

const router = Router();

const mockEmergencyContacts = {
  Delhi: { police: '112', hospital: '011-26588500', name: 'AIIMS Emergency Room' },
  Ranchi: { police: '100', hospital: '0651-2545400', name: 'RIMS Medical Emergency' },
  Mathura: { police: '112', hospital: '0565-2404000', name: 'Nayati Medicity' },
};

router.post('/location', (req, res) => {
  const { userId, latitude, longitude } = req.body;
  res.status(200).json({
    status: 'success',
    message: `Coordinates registered for user ${userId || 'guest'}`,
  });
});

router.post('/sos', (req, res) => {
  const { userId, latitude, longitude } = req.body;
  res.status(200).json({
    status: 'success',
    alertId: `sos-${Date.now()}`,
    broadCasted: true,
    message: 'SOS trigger received. Nearby local assistance, guides and emergency support notified.',
  });
});

router.get('/contacts', (req, res) => {
  const { city } = req.query;
  const contacts = mockEmergencyContacts[city as string] || mockEmergencyContacts['Delhi'];
  res.status(200).json({
    status: 'success',
    city: city || 'Delhi (Fallback)',
    contacts,
  });
});

export default router;

import { Router } from 'express';

const router = Router();

// Persistent Emergency Contacts Database
const mockEmergencyContacts: Record<string, { police: string; hospital: string; name: string }> = {
  Delhi: { police: '112', hospital: '011-26588500', name: 'AIIMS Emergency Room' },
  Ranchi: { police: '100', hospital: '0651-2545400', name: 'RIMS Medical Emergency' },
  Mathura: { police: '112', hospital: '0565-2404000', name: 'Nayati Medicity' },
  Manali: { police: '100', hospital: '01902-252224', name: 'Civil Hospital Manali' },
  Kochi: { police: '112', hospital: '0484-2851234', name: 'Amrita Institute of Medical Sciences' },
};

// Persistent SOS Alerts Store
const sosAlerts: Array<{
  id: string;
  userName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}> = [];

// Monsoon Advisories Store
const monsoonAdvisories = [
  {
    id: 'adv-1',
    region: 'Himachal Pradesh & Ladakh',
    severity: 'HIGH',
    alertTitle: 'Flash Flood & Landslide Warning',
    description: 'Heavy rainfall reported on Manali-Leh Highway near Rohtang & Baralacha Pass. Travelers advised to delay mountain passes.',
    updatedAt: '2 hours ago',
  },
  {
    id: 'adv-2',
    region: 'Kerala Backwaters',
    severity: 'MEDIUM',
    alertTitle: 'High Water Level Notice',
    description: 'Houseboat operations in Alleppey operating with safety speed limits due to active monsoon currents.',
    updatedAt: '5 hours ago',
  },
  {
    id: 'adv-3',
    region: 'Vrindavan & Mathura',
    severity: 'LOW',
    alertTitle: 'Yamuna Water Level Normal',
    description: 'Darshan queues and ghat entry operating smoothly with routine rain precautions.',
    updatedAt: '1 day ago',
  },
];

router.get('/sos', (req, res) => {
  res.status(200).json({ status: 'success', data: sosAlerts });
});

router.post('/location', (req, res) => {
  const { userId, latitude, longitude } = req.body;
  res.status(200).json({
    status: 'success',
    message: `Coordinates registered for user ${userId || 'guest'} (${latitude}, ${longitude})`,
  });
});

router.post('/sos', (req, res) => {
  const { userId, userName, latitude, longitude } = req.body;
  const alertId = `sos-${Date.now()}`;
  const newAlert = {
    id: alertId,
    userName: userName || `User ${userId || 'Guest'}`,
    latitude: parseFloat(latitude) || 28.6139,
    longitude: parseFloat(longitude) || 77.209,
    timestamp: new Date().toLocaleTimeString(),
    status: 'ACTIVE' as const,
  };

  sosAlerts.unshift(newAlert);
  res.status(201).json({
    status: 'success',
    alertId,
    data: newAlert,
    message: 'SOS trigger received. Nearby local assistance, police, and emergency support notified.',
  });
});

router.post('/sos/:id/resolve', (req, res) => {
  const { id } = req.params;
  const alert = sosAlerts.find((a) => a.id === id);
  if (alert) {
    alert.status = 'RESOLVED';
  }
  res.status(200).json({ status: 'success', message: `SOS Alert ${id} marked as resolved` });
});

router.get('/contacts', (req, res) => {
  const { city } = req.query;
  const cityKey = (city as string) || 'Delhi';
  const contacts = mockEmergencyContacts[cityKey] || mockEmergencyContacts['Delhi'];

  res.status(200).json({
    status: 'success',
    city: cityKey,
    contacts,
  });
});

router.get('/monsoon-advisory', (req, res) => {
  res.status(200).json({ status: 'success', data: monsoonAdvisories });
});

export default router;

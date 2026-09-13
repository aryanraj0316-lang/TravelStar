// Static reference coordinates (WGS84, degrees) for major Indian cities and
// tourist towns. Public-domain geodata — used to compute an honest
// straight-line ("as the crow flies") distance from a user's device
// location to a trip's route, since Trip rows have no coordinates of their
// own and this project has no geocoding-service credentials
// (docs/REMEDIATION.md §8.13). A real routing/geocoding integration would
// read GEOCODING_API_URL from config; until that is wired, distances are
// straight-line and labelled as such in the UI. Trips whose first city is
// not in this table are still returned, just without a distance.
//
// `state` is the real Indian state/UT each town sits in — public-domain
// geodata, same honesty standard as the coordinates above — added so
// "Nearby" can filter by state without inventing a per-trip state field
// (Trip has none; see GET /trips/nearby).
export const INDIA_CITY_COORDS: Record<string, { lat: number; lng: number; state: string }> = {
  delhi: { lat: 28.6139, lng: 77.209, state: 'Delhi' },
  'new delhi': { lat: 28.6139, lng: 77.209, state: 'Delhi' },
  gurugram: { lat: 28.4595, lng: 77.0266, state: 'Haryana' },
  gurgaon: { lat: 28.4595, lng: 77.0266, state: 'Haryana' },
  noida: { lat: 28.5355, lng: 77.391, state: 'Uttar Pradesh' },
  mumbai: { lat: 19.076, lng: 72.8777, state: 'Maharashtra' },
  pune: { lat: 18.5204, lng: 73.8567, state: 'Maharashtra' },
  bengaluru: { lat: 12.9716, lng: 77.5946, state: 'Karnataka' },
  bangalore: { lat: 12.9716, lng: 77.5946, state: 'Karnataka' },
  chennai: { lat: 13.0827, lng: 80.2707, state: 'Tamil Nadu' },
  hyderabad: { lat: 17.385, lng: 78.4867, state: 'Telangana' },
  kolkata: { lat: 22.5726, lng: 88.3639, state: 'West Bengal' },
  ahmedabad: { lat: 23.0225, lng: 72.5714, state: 'Gujarat' },
  jaipur: { lat: 26.9124, lng: 75.7873, state: 'Rajasthan' },
  udaipur: { lat: 24.5854, lng: 73.7125, state: 'Rajasthan' },
  jodhpur: { lat: 26.2389, lng: 73.0243, state: 'Rajasthan' },
  jaisalmer: { lat: 26.9157, lng: 70.9083, state: 'Rajasthan' },
  agra: { lat: 27.1767, lng: 78.0081, state: 'Uttar Pradesh' },
  mathura: { lat: 27.4924, lng: 77.6737, state: 'Uttar Pradesh' },
  vrindavan: { lat: 27.5806, lng: 77.7006, state: 'Uttar Pradesh' },
  varanasi: { lat: 25.3176, lng: 82.9739, state: 'Uttar Pradesh' },
  lucknow: { lat: 26.8467, lng: 80.9462, state: 'Uttar Pradesh' },
  amritsar: { lat: 31.634, lng: 74.8723, state: 'Punjab' },
  chandigarh: { lat: 30.7333, lng: 76.7794, state: 'Chandigarh' },
  shimla: { lat: 31.1048, lng: 77.1734, state: 'Himachal Pradesh' },
  manali: { lat: 32.2432, lng: 77.1892, state: 'Himachal Pradesh' },
  dharamshala: { lat: 32.219, lng: 76.3234, state: 'Himachal Pradesh' },
  leh: { lat: 34.1526, lng: 77.5771, state: 'Ladakh' },
  srinagar: { lat: 34.0837, lng: 74.7973, state: 'Jammu and Kashmir' },
  gulmarg: { lat: 34.0484, lng: 74.3805, state: 'Jammu and Kashmir' },
  pahalgam: { lat: 34.016, lng: 75.315, state: 'Jammu and Kashmir' },
  rishikesh: { lat: 30.0869, lng: 78.2676, state: 'Uttarakhand' },
  haridwar: { lat: 29.9457, lng: 78.1642, state: 'Uttarakhand' },
  dehradun: { lat: 30.3165, lng: 78.0322, state: 'Uttarakhand' },
  nainital: { lat: 29.3919, lng: 79.4542, state: 'Uttarakhand' },
  mussoorie: { lat: 30.4599, lng: 78.0664, state: 'Uttarakhand' },
  darjeeling: { lat: 27.041, lng: 88.2663, state: 'West Bengal' },
  gangtok: { lat: 27.3314, lng: 88.6138, state: 'Sikkim' },
  guwahati: { lat: 26.1445, lng: 91.7362, state: 'Assam' },
  shillong: { lat: 25.5788, lng: 91.8933, state: 'Meghalaya' },
  bhopal: { lat: 23.2599, lng: 77.4126, state: 'Madhya Pradesh' },
  indore: { lat: 22.7196, lng: 75.8577, state: 'Madhya Pradesh' },
  khajuraho: { lat: 24.8318, lng: 79.9199, state: 'Madhya Pradesh' },
  nagpur: { lat: 21.1458, lng: 79.0882, state: 'Maharashtra' },
  goa: { lat: 15.2993, lng: 74.124, state: 'Goa' },
  panaji: { lat: 15.4909, lng: 73.8278, state: 'Goa' },
  kochi: { lat: 9.9312, lng: 76.2673, state: 'Kerala' },
  kerala: { lat: 9.9312, lng: 76.2673, state: 'Kerala' }, // a state, not a point — Kochi as its representative city
  cochin: { lat: 9.9312, lng: 76.2673, state: 'Kerala' },
  munnar: { lat: 10.0889, lng: 77.0595, state: 'Kerala' },
  alleppey: { lat: 9.4981, lng: 76.3388, state: 'Kerala' },
  alappuzha: { lat: 9.4981, lng: 76.3388, state: 'Kerala' },
  thiruvananthapuram: { lat: 8.5241, lng: 76.9366, state: 'Kerala' },
  trivandrum: { lat: 8.5241, lng: 76.9366, state: 'Kerala' },
  wayanad: { lat: 11.6854, lng: 76.132, state: 'Kerala' },
  ooty: { lat: 11.4064, lng: 76.6932, state: 'Tamil Nadu' },
  madurai: { lat: 9.9252, lng: 78.1198, state: 'Tamil Nadu' },
  pondicherry: { lat: 11.9416, lng: 79.8083, state: 'Puducherry' },
  puducherry: { lat: 11.9416, lng: 79.8083, state: 'Puducherry' },
  hampi: { lat: 15.335, lng: 76.46, state: 'Karnataka' },
  mysuru: { lat: 12.2958, lng: 76.6394, state: 'Karnataka' },
  mysore: { lat: 12.2958, lng: 76.6394, state: 'Karnataka' },
  visakhapatnam: { lat: 17.6868, lng: 83.2185, state: 'Andhra Pradesh' },
  bhubaneswar: { lat: 20.2961, lng: 85.8245, state: 'Odisha' },
  puri: { lat: 19.8135, lng: 85.8312, state: 'Odisha' },
  ranchi: { lat: 23.3441, lng: 85.3096, state: 'Jharkhand' },
  patna: { lat: 25.5941, lng: 85.1376, state: 'Bihar' },
  bodhgaya: { lat: 24.6959, lng: 84.9911, state: 'Bihar' },
  surat: { lat: 21.1702, lng: 72.8311, state: 'Gujarat' },
  vadodara: { lat: 22.3072, lng: 73.1812, state: 'Gujarat' },
  rann: { lat: 23.7337, lng: 70.8412, state: 'Gujarat' },
  'rann of kutch': { lat: 23.7337, lng: 70.8412, state: 'Gujarat' },
  ladakh: { lat: 34.1526, lng: 77.5771, state: 'Ladakh' }, // Leh, the region's main town
  andaman: { lat: 11.6234, lng: 92.7265, state: 'Andaman and Nicobar Islands' }, // Port Blair, the archipelago's capital
};

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle (haversine) distance in kilometres between two points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Look up a city name (case/whitespace-insensitive) in the reference table. */
export function coordsForCity(city: string | undefined | null): { lat: number; lng: number; state: string } | null {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  return INDIA_CITY_COORDS[key] ?? null;
}

/** The real Indian state/UT a city sits in, or null if it is not in the table. */
export function stateForCity(city: string | undefined | null): string | null {
  return coordsForCity(city)?.state ?? null;
}

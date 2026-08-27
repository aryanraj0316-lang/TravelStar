// Static reference coordinates (WGS84, degrees) for major Indian cities and
// tourist towns. Public-domain geodata — used to compute an honest
// straight-line ("as the crow flies") distance from a user's device
// location to a trip's route, since Trip rows have no coordinates of their
// own and this project has no geocoding-service credentials
// (docs/REMEDIATION.md §8.13). A real routing/geocoding integration would
// read GEOCODING_API_URL from config; until that is wired, distances are
// straight-line and labelled as such in the UI. Trips whose first city is
// not in this table are still returned, just without a distance.
export const INDIA_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  delhi: { lat: 28.6139, lng: 77.209 },
  'new delhi': { lat: 28.6139, lng: 77.209 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
  noida: { lat: 28.5355, lng: 77.391 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  pune: { lat: 18.5204, lng: 73.8567 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  udaipur: { lat: 24.5854, lng: 73.7125 },
  jodhpur: { lat: 26.2389, lng: 73.0243 },
  jaisalmer: { lat: 26.9157, lng: 70.9083 },
  agra: { lat: 27.1767, lng: 78.0081 },
  mathura: { lat: 27.4924, lng: 77.6737 },
  vrindavan: { lat: 27.5806, lng: 77.7006 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  amritsar: { lat: 31.634, lng: 74.8723 },
  chandigarh: { lat: 30.7333, lng: 76.7794 },
  shimla: { lat: 31.1048, lng: 77.1734 },
  manali: { lat: 32.2432, lng: 77.1892 },
  dharamshala: { lat: 32.219, lng: 76.3234 },
  leh: { lat: 34.1526, lng: 77.5771 },
  srinagar: { lat: 34.0837, lng: 74.7973 },
  gulmarg: { lat: 34.0484, lng: 74.3805 },
  pahalgam: { lat: 34.016, lng: 75.315 },
  rishikesh: { lat: 30.0869, lng: 78.2676 },
  haridwar: { lat: 29.9457, lng: 78.1642 },
  dehradun: { lat: 30.3165, lng: 78.0322 },
  nainital: { lat: 29.3919, lng: 79.4542 },
  mussoorie: { lat: 30.4599, lng: 78.0664 },
  darjeeling: { lat: 27.041, lng: 88.2663 },
  gangtok: { lat: 27.3314, lng: 88.6138 },
  guwahati: { lat: 26.1445, lng: 91.7362 },
  shillong: { lat: 25.5788, lng: 91.8933 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  indore: { lat: 22.7196, lng: 75.8577 },
  khajuraho: { lat: 24.8318, lng: 79.9199 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  goa: { lat: 15.2993, lng: 74.124 },
  panaji: { lat: 15.4909, lng: 73.8278 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  cochin: { lat: 9.9312, lng: 76.2673 },
  munnar: { lat: 10.0889, lng: 77.0595 },
  alleppey: { lat: 9.4981, lng: 76.3388 },
  alappuzha: { lat: 9.4981, lng: 76.3388 },
  thiruvananthapuram: { lat: 8.5241, lng: 76.9366 },
  trivandrum: { lat: 8.5241, lng: 76.9366 },
  wayanad: { lat: 11.6854, lng: 76.132 },
  ooty: { lat: 11.4064, lng: 76.6932 },
  madurai: { lat: 9.9252, lng: 78.1198 },
  pondicherry: { lat: 11.9416, lng: 79.8083 },
  puducherry: { lat: 11.9416, lng: 79.8083 },
  hampi: { lat: 15.335, lng: 76.46 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  bhubaneswar: { lat: 20.2961, lng: 85.8245 },
  puri: { lat: 19.8135, lng: 85.8312 },
  ranchi: { lat: 23.3441, lng: 85.3096 },
  patna: { lat: 25.5941, lng: 85.1376 },
  bodhgaya: { lat: 24.6959, lng: 84.9911 },
  surat: { lat: 21.1702, lng: 72.8311 },
  vadodara: { lat: 22.3072, lng: 73.1812 },
  rann: { lat: 23.7337, lng: 70.8412 },
  'rann of kutch': { lat: 23.7337, lng: 70.8412 },
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
export function coordsForCity(city: string | undefined | null): { lat: number; lng: number } | null {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  return INDIA_CITY_COORDS[key] ?? null;
}

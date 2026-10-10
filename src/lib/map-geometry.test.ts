import {
  decodePolyline,
  downsample,
  estimateDurationMinutes,
  formatDistanceKm,
  formatEta,
  greatCircleArc,
  haversineKm,
  pathLengthKm,
  smoothCurve,
  travelModeForTransit,
} from './map-geometry';

const DELHI = { latitude: 28.6139, longitude: 77.209 };
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

describe('decodePolyline', () => {
  it('decodes the reference example from the Google polyline spec', () => {
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(coords).toHaveLength(3);
    expect(coords[0].latitude).toBeCloseTo(38.5, 5);
    expect(coords[0].longitude).toBeCloseTo(-120.2, 5);
    expect(coords[1].latitude).toBeCloseTo(40.7, 5);
    expect(coords[1].longitude).toBeCloseTo(-120.95, 5);
    expect(coords[2].latitude).toBeCloseTo(43.252, 5);
    expect(coords[2].longitude).toBeCloseTo(-126.453, 5);
  });

  it('returns what decoded cleanly instead of throwing on truncated input', () => {
    expect(() => decodePolyline('_p~iF~ps|U_ulL')).not.toThrow();
    expect(decodePolyline('_p~iF~ps|U_ulL')).toHaveLength(1);
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('haversineKm', () => {
  it('measures Delhi to Mumbai at roughly 1,150 km', () => {
    expect(haversineKm(DELHI, MUMBAI)).toBeGreaterThan(1130);
    expect(haversineKm(DELHI, MUMBAI)).toBeLessThan(1170);
  });
});

describe('greatCircleArc', () => {
  it('starts and ends at the endpoints and has the requested resolution', () => {
    const arc = greatCircleArc(DELHI, MUMBAI, 32);
    expect(arc).toHaveLength(33);
    expect(arc[0].latitude).toBeCloseTo(DELHI.latitude, 6);
    expect(arc[32].longitude).toBeCloseTo(MUMBAI.longitude, 6);
  });

  it('follows the great circle, so its length equals the haversine distance', () => {
    const arc = greatCircleArc(DELHI, MUMBAI);
    expect(pathLengthKm(arc)).toBeCloseTo(haversineKm(DELHI, MUMBAI), 0);
  });

  it('bows poleward of the straight lat/lng line on a long east-west flight', () => {
    const london = { latitude: 51.47, longitude: -0.45 };
    const tokyo = { latitude: 35.55, longitude: 139.78 };
    const arc = greatCircleArc(london, tokyo, 10);
    const linearMidLat = (london.latitude + tokyo.latitude) / 2;
    expect(arc[5].latitude).toBeGreaterThan(linearMidLat + 10);
  });

  it('degrades to the two points for identical endpoints', () => {
    expect(greatCircleArc(DELHI, DELHI)).toHaveLength(2);
  });
});

describe('smoothCurve', () => {
  it('passes through both endpoints and bows away from the chord', () => {
    const curve = smoothCurve(DELHI, MUMBAI, 0.1, 20);
    expect(curve[0]).toEqual({ latitude: DELHI.latitude, longitude: DELHI.longitude });
    expect(curve[20].latitude).toBeCloseTo(MUMBAI.latitude, 9);
    const mid = curve[10];
    const chordMidLng = (DELHI.longitude + MUMBAI.longitude) / 2;
    expect(Math.abs(mid.longitude - chordMidLng)).toBeGreaterThan(0.1);
  });
});

describe('downsample', () => {
  it('keeps both ends and caps the point count', () => {
    const line = Array.from({ length: 10_001 }, (_, i) => ({ latitude: i / 1000, longitude: 0 }));
    const thinned = downsample(line, 500);
    expect(thinned).toHaveLength(500);
    expect(thinned[0]).toBe(line[0]);
    expect(thinned[499]).toBe(line[10_000]);
  });

  it('leaves short lines untouched', () => {
    const line = [DELHI, MUMBAI];
    expect(downsample(line, 500)).toBe(line);
  });
});

describe('travelModeForTransit', () => {
  it('maps organizer transit modes onto drawable modes', () => {
    expect(travelModeForTransit('CAB')).toBe('car');
    expect(travelModeForTransit('BUS')).toBe('car');
    expect(travelModeForTransit('TRAIN')).toBe('train');
    expect(travelModeForTransit('FLIGHT')).toBe('flight');
    expect(travelModeForTransit(null)).toBe('car');
  });
});

describe('estimateDurationMinutes', () => {
  it('estimates only for train and flight', () => {
    expect(estimateDurationMinutes('car', 100)).toBeNull();
    expect(estimateDurationMinutes('bike', 100)).toBeNull();
    expect(estimateDurationMinutes('train', 110)).toBe(120);
    expect(estimateDurationMinutes('flight', 750)).toBe(90);
    expect(estimateDurationMinutes('flight', 0)).toBeNull();
  });
});

describe('formatters', () => {
  it('formats distances', () => {
    expect(formatDistanceKm(0.4)).toBe('400 m');
    expect(formatDistanceKm(4.26)).toBe('4.3 km');
    expect(formatDistanceKm(124.4)).toBe('124 km');
  });

  it('formats ETAs', () => {
    expect(formatEta(165)).toBe('2 hr 45 min');
    expect(formatEta(45)).toBe('45 min');
    expect(formatEta(180)).toBe('3 hr');
    expect(formatEta(null)).toBeNull();
    expect(formatEta(0)).toBeNull();
  });
});

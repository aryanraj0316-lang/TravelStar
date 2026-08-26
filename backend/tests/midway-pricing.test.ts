import { calculateMidwayPrice } from '../src/services/midway-pricing';

describe('calculateMidwayPrice (Family Connect midway-join pricing, §8.6)', () => {
  const cities = ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan']; // 3 segments

  it('charges the full proportional share of the traveled segments, minus 10%', () => {
    // Delhi -> Vrindavan is 2 of 3 segments: 8500 * (2/3) * 0.9 = 5100
    const result = calculateMidwayPrice(cities, 8500, 'Delhi', 'Vrindavan');
    expect(result).toEqual({ ok: true, adjustedPrice: 5100, segmentsTraversed: ['Delhi', 'Mathura', 'Vrindavan'] });
  });

  it('charges for a single segment correctly', () => {
    // Mathura -> Vrindavan is 1 of 3 segments: 8500 * (1/3) * 0.9 = 2550
    const result = calculateMidwayPrice(cities, 8500, 'Mathura', 'Vrindavan');
    expect(result).toEqual({ ok: true, adjustedPrice: 2550, segmentsTraversed: ['Mathura', 'Vrindavan'] });
  });

  it('rejects a toCity that is not in the route', () => {
    expect(calculateMidwayPrice(cities, 8500, 'Delhi', 'Nowhere')).toEqual({ ok: false, reason: 'INVALID_SEGMENT' });
  });

  it('rejects a fromCity that is not in the route', () => {
    expect(calculateMidwayPrice(cities, 8500, 'Nowhere', 'Vrindavan')).toEqual({ ok: false, reason: 'INVALID_SEGMENT' });
  });

  it('rejects toCity coming before fromCity on the route', () => {
    expect(calculateMidwayPrice(cities, 8500, 'Vrindavan', 'Delhi')).toEqual({ ok: false, reason: 'INVALID_SEGMENT' });
  });

  it('rejects fromCity === toCity (zero-length segment)', () => {
    expect(calculateMidwayPrice(cities, 8500, 'Delhi', 'Delhi')).toEqual({ ok: false, reason: 'INVALID_SEGMENT' });
  });

  it('never returns the full undiscounted price for a genuine partial segment', () => {
    // This is the exact bug REMEDIATION.md §8.6 flagged in the old client-only
    // version: an invalid selection silently fell back to full price instead
    // of being rejected. A valid partial segment must always price below the
    // full trip cost, and an invalid one must be an explicit error, not a
    // silent full-price fallback.
    const full = calculateMidwayPrice(cities, 8500, 'Ranchi', 'Vrindavan');
    expect(full).toEqual({ ok: true, adjustedPrice: 7650, segmentsTraversed: cities }); // full route still gets the 0.9 discount applied
    expect(full.ok && full.adjustedPrice).toBeLessThan(8500);
  });
});

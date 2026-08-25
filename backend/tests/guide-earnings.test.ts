import { dayOfWeekBucket } from '../src/api/routes/guides';

describe('dayOfWeekBucket (Monday-first weekday chart mapping)', () => {
  // Date.UTC days chosen as known weekdays; using UTC to keep the test
  // independent of the host machine's timezone.
  const cases: Array<[string, string, number]> = [
    ['Monday', '2026-08-24T12:00:00Z', 0],
    ['Tuesday', '2026-08-25T12:00:00Z', 1],
    ['Wednesday', '2026-08-26T12:00:00Z', 2],
    ['Thursday', '2026-08-27T12:00:00Z', 3],
    ['Friday', '2026-08-28T12:00:00Z', 4],
    ['Saturday', '2026-08-29T12:00:00Z', 5],
    ['Sunday', '2026-08-30T12:00:00Z', 6],
  ];

  it.each(cases)('maps %s (%s) to bucket index %i', (_label, iso, expected) => {
    expect(dayOfWeekBucket(new Date(iso))).toBe(expected);
  });

  it('wraps Sunday (JS getDay() === 0) to the last bucket, not the first', () => {
    const sunday = new Date('2026-08-30T00:00:00Z');
    expect(sunday.getDay()).toBe(0);
    expect(dayOfWeekBucket(sunday)).toBe(6);
  });
});

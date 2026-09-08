import { formatTransitTime, parseTransitMinutes } from './transit-time';

describe('parseTransitMinutes', () => {
  it.each([
    ['3h 30m', 210],
    ['3h', 180],
    ['30m', 30],
    ['3 hr 30 min', 210],
    ['2 hours 15 minutes', 135],
    ['1:30', 90],
    ['12:05', 725],
    ['90', 90],
  ])('parses %s to %i minutes', (input, expected) => {
    expect(parseTransitMinutes(input)).toBe(expected);
  });

  it('is whitespace and case insensitive', () => {
    expect(parseTransitMinutes('  4H 15M  ')).toBe(255);
  });

  // The presets the Timeline tab offers must all round-trip, or an
  // organizer's pick would silently become "no travel time".
  it.each(['1h', '2h 30m', '4h', '6h', '8h', '12h'])('parses the %s preset', (preset) => {
    expect(parseTransitMinutes(preset)).toBeGreaterThan(0);
  });

  it('returns null for a qualitative word rather than guessing a duration', () => {
    // "Overnight" says when a leg runs, not how long it takes. Inventing a
    // number here would put a fabricated travel time on a real trip.
    expect(parseTransitMinutes('Overnight')).toBeNull();
    expect(parseTransitMinutes('a while')).toBeNull();
  });

  it('returns null for empty, missing or zero input', () => {
    expect(parseTransitMinutes('')).toBeNull();
    expect(parseTransitMinutes('   ')).toBeNull();
    expect(parseTransitMinutes(null)).toBeNull();
    expect(parseTransitMinutes(undefined)).toBeNull();
    expect(parseTransitMinutes('0')).toBeNull();
    expect(parseTransitMinutes('0h 0m')).toBeNull();
  });
});

describe('formatTransitTime', () => {
  it.each([
    [210, '3h 30m'],
    [180, '3h'],
    [45, '45m'],
    [725, '12h 5m'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatTransitTime(minutes)).toBe(expected);
  });

  it('returns null for absent or nonsensical values, never a placeholder', () => {
    expect(formatTransitTime(null)).toBeNull();
    expect(formatTransitTime(undefined)).toBeNull();
    expect(formatTransitTime(0)).toBeNull();
    expect(formatTransitTime(-30)).toBeNull();
    expect(formatTransitTime(Number.NaN)).toBeNull();
  });

  it('round-trips a parsed duration', () => {
    const minutes = parseTransitMinutes('5h 45m');
    expect(formatTransitTime(minutes)).toBe('5h 45m');
  });
});

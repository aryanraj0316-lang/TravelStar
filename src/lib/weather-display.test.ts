import { coarseCoordinate, weatherGlyph } from './weather-display';

describe('weatherGlyph', () => {
  // The exact strings backend/src/api/routes/weather.ts can return.
  it.each([
    ['Clear Sky', 'sun'],
    ['Mainly Clear', 'cloud-sun'],
    ['Partly Cloudy', 'cloud-sun'],
    ['Overcast', 'cloud'],
    ['Foggy', 'fog'],
    ['Drizzle', 'rain'],
    ['Freezing Drizzle', 'rain'],
    ['Rain', 'rain'],
    ['Freezing Rain', 'rain'],
    ['Snowfall', 'snow'],
    ['Rain Showers', 'rain'],
    ['Snow Showers', 'snow'],
    ['Thunderstorm', 'storm'],
    ['Thunderstorm with Hail', 'storm'],
  ] as const)('maps %s to the %s glyph', (condition, glyph) => {
    expect(weatherGlyph(condition)).toBe(glyph);
  });

  it('is case insensitive', () => {
    expect(weatherGlyph('PARTLY CLOUDY')).toBe('cloud-sun');
  });

  it('falls back to the neutral cloud rather than guessing sun', () => {
    expect(weatherGlyph('Unknown')).toBe('cloud');
    expect(weatherGlyph('')).toBe('cloud');
    expect(weatherGlyph(null)).toBe('cloud');
    expect(weatherGlyph(undefined)).toBe('cloud');
  });
});

describe('coarseCoordinate', () => {
  it('rounds to the two decimal places the server caches at', () => {
    expect(coarseCoordinate(28.61394)).toBe(28.61);
    expect(coarseCoordinate(77.20902)).toBe(77.21);
  });

  it('rounds negative coordinates away from zero at the midpoint, consistently', () => {
    expect(coarseCoordinate(-33.8688)).toBe(-33.87);
  });

  it('collapses jitter smaller than the cache granularity to one key', () => {
    expect(coarseCoordinate(28.6139)).toBe(coarseCoordinate(28.6142));
  });
});

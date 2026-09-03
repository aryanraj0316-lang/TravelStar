import {
  formatTripDuration,
  nightsBetween,
  tripCoverImage,
  tripInclusions,
  tripRouteLabel,
  tripTransportLabel,
} from './trip-display';

describe('nightsBetween', () => {
  it('counts whole nights between two ISO dates', () => {
    expect(nightsBetween('2026-08-14T00:00:00Z', '2026-08-19T00:00:00Z')).toBe(5);
  });

  it('returns 0 when either date is missing', () => {
    expect(nightsBetween(undefined, '2026-08-19T00:00:00Z')).toBe(0);
    expect(nightsBetween('2026-08-14T00:00:00Z', undefined)).toBe(0);
  });

  it('returns 0 for an invalid date string rather than NaN', () => {
    expect(nightsBetween('not-a-date', '2026-08-19T00:00:00Z')).toBe(0);
  });

  it('returns 0 when the end is not after the start', () => {
    expect(nightsBetween('2026-08-19T00:00:00Z', '2026-08-14T00:00:00Z')).toBe(0);
    expect(nightsBetween('2026-08-14T00:00:00Z', '2026-08-14T00:00:00Z')).toBe(0);
  });
});

describe('formatTripDuration', () => {
  it('formats a normal range as "N Nights / N+1 Days"', () => {
    expect(formatTripDuration({ startDate: '2026-08-14T00:00:00Z', endDate: '2026-08-19T00:00:00Z' })).toBe(
      '5 Nights / 6 Days',
    );
  });

  it('uses the singular for a single-night trip', () => {
    expect(formatTripDuration({ startDate: '2026-08-14T00:00:00Z', endDate: '2026-08-15T00:00:00Z' })).toBe(
      '1 Night / 2 Days',
    );
  });

  it('returns null rather than a fabricated duration when dates are missing', () => {
    expect(formatTripDuration({ startDate: '', endDate: '' })).toBeNull();
  });

  it('returns null rather than a fabricated duration for an invalid range', () => {
    expect(formatTripDuration({ startDate: '2026-08-19T00:00:00Z', endDate: '2026-08-14T00:00:00Z' })).toBeNull();
  });
});

describe('tripInclusions', () => {
  it('lists only the inclusions the real columns say are true', () => {
    expect(
      tripInclusions({ guideIncluded: true, foodIncluded: false, hotelIncluded: true, cabIncluded: false }),
    ).toEqual(['Guide', 'Hotel']);
  });

  it('returns an empty list when nothing is included', () => {
    expect(
      tripInclusions({ guideIncluded: false, foodIncluded: false, hotelIncluded: false, cabIncluded: false }),
    ).toEqual([]);
  });
});

describe('tripTransportLabel', () => {
  it('reports transport only from the real cabIncluded column', () => {
    expect(tripTransportLabel({ cabIncluded: true })).toBe('Transport included');
  });

  it('returns null rather than guessing from the trip title', () => {
    expect(tripTransportLabel({ cabIncluded: false })).toBeNull();
  });
});

describe('tripCoverImage', () => {
  it('returns a real remote URL as-is', () => {
    expect(tripCoverImage({ coverImage: 'https://cdn.example.com/trip.jpg' })).toBe(
      'https://cdn.example.com/trip.jpg',
    );
  });

  it('treats a device-local file:// URI as absent — it resolves for nobody else', () => {
    expect(tripCoverImage({ coverImage: 'file:///data/user/0/host/cache/img.jpg' })).toBeNull();
  });

  it('treats a blob: URI as absent', () => {
    expect(tripCoverImage({ coverImage: 'blob:https://app.example.com/abc-123' })).toBeNull();
  });

  it('treats a data: URI as absent', () => {
    expect(tripCoverImage({ coverImage: 'data:image/png;base64,iVBORw0KGgo=' })).toBeNull();
  });

  it('returns null for a missing or blank cover image', () => {
    expect(tripCoverImage({ coverImage: undefined })).toBeNull();
    expect(tripCoverImage({ coverImage: '   ' })).toBeNull();
  });
});

describe('tripRouteLabel', () => {
  it('joins real cities with an arrow', () => {
    expect(tripRouteLabel({ cities: ['Delhi', 'Agra', 'Jaipur'], meetingPoint: '' })).toBe(
      'Delhi → Agra → Jaipur',
    );
  });

  it('falls back to the meeting point when there are no cities', () => {
    expect(tripRouteLabel({ cities: [], meetingPoint: 'India Gate' })).toBe('India Gate');
  });

  it('falls back to an honest placeholder when neither is set', () => {
    expect(tripRouteLabel({ cities: [], meetingPoint: '' })).toBe('Route to be announced');
  });
});

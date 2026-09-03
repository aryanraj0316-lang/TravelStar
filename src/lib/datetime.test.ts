import i18n, { initI18n } from '@/lib/i18n';
import {
  formatDate,
  formatDateRange,
  formatDateShort,
  formatDateTime,
  formatMessageTimestamp,
  formatRelative,
  formatTime,
  isToday,
  toDate,
} from './datetime';

beforeAll(() => {
  initI18n();
});

describe('toDate', () => {
  it('parses an ISO string', () => {
    expect(toDate('2026-08-14T10:00:00Z')?.getTime()).toBe(new Date('2026-08-14T10:00:00Z').getTime());
  });

  it('passes a Date instance through', () => {
    const d = new Date('2026-08-14T10:00:00Z');
    expect(toDate(d)).toBe(d);
  });

  it('returns null for null, undefined, and empty string', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('')).toBeNull();
  });

  it('returns null for an unparseable string rather than an Invalid Date', () => {
    expect(toDate('not-a-date')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats a wire ISO string as "14 Aug 2026"', () => {
    expect(formatDate('2026-08-14T10:00:00Z')).toBe('14 Aug 2026');
  });

  it('falls back to the em-dash for a missing value', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('falls back to a custom fallback for an unparseable value', () => {
    expect(formatDate('not-a-date', 'N/A')).toBe('N/A');
  });
});

describe('formatDateShort', () => {
  it('omits the year', () => {
    expect(formatDateShort('2026-08-14T10:00:00Z')).toBe('14 Aug');
  });
});

describe('formatTime', () => {
  it('formats a 12-hour time with am/pm', () => {
    // 14:05 UTC is 19:35 IST (UTC+5:30) under the Asia/Kolkata fallback zone.
    expect(formatTime('2026-08-14T14:05:00Z')).toMatch(/7:35\s*pm/i);
  });
});

describe('formatDateRange', () => {
  it('collapses the repeated year when both ends share one', () => {
    expect(formatDateRange('2026-08-14T00:00:00Z', '2026-08-19T00:00:00Z')).toBe('14 Aug – 19 Aug 2026');
  });

  it('shows both years when the range spans a year boundary', () => {
    expect(formatDateRange('2026-12-30T00:00:00Z', '2027-01-02T00:00:00Z')).toBe('30 Dec 2026 – 2 Jan 2027');
  });

  it('falls back to a single formatted date when only the start is present', () => {
    expect(formatDateRange('2026-08-14T00:00:00Z', null)).toBe('14 Aug 2026');
  });

  it('falls back to a single formatted date when only the end is present', () => {
    expect(formatDateRange(null, '2026-08-19T00:00:00Z')).toBe('19 Aug 2026');
  });

  it('falls back to the em-dash when both ends are missing', () => {
    expect(formatDateRange(null, null)).toBe('—');
  });
});

describe('formatRelative', () => {
  it('reports "just now" for an instant less than a minute away', () => {
    expect(formatRelative(new Date(Date.now() - 10_000))).toBe(i18n.t('common.justNow'));
  });

  it('reports minutes ago for the recent past', () => {
    expect(formatRelative(new Date(Date.now() - 5 * 60_000))).toMatch(/5/);
  });

  it('falls back to an absolute date beyond ~4 weeks', () => {
    const farPast = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    expect(formatRelative(farPast)).toBe(formatDate(farPast));
  });

  it('falls back to the em-dash for a missing value', () => {
    expect(formatRelative(null)).toBe('—');
  });
});

describe('isToday', () => {
  it('is true for the current instant', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('is false for a date far in the past', () => {
    expect(isToday('2020-01-01T00:00:00Z')).toBe(false);
  });

  it('is false for a missing value', () => {
    expect(isToday(null)).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('includes both the date and the time', () => {
    const formatted = formatDateTime('2026-08-14T14:05:00Z');
    expect(formatted).toContain('14 Aug 2026');
    expect(formatted).toMatch(/7:35\s*pm/i);
  });
});

describe('formatMessageTimestamp', () => {
  it('renders just the time for a message sent today', () => {
    const now = new Date();
    expect(formatMessageTimestamp(now)).toBe(formatTime(now));
  });

  it('renders the full date and time for a message from a previous day', () => {
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatMessageTimestamp(yesterday)).toBe(formatDateTime(yesterday));
  });

  it('falls back to an empty string for a missing value', () => {
    expect(formatMessageTimestamp(null)).toBe('');
  });
});

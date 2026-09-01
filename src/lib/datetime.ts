// The single date/time formatting surface (docs/REMEDIATION.md §0.2.3 /
// CONVENTIONS.md §4).
//
// Everything crosses the wire as an ISO 8601 UTC string and is stored as
// timestamptz. Display formatting happens only here, so the app cannot
// disagree with itself about what "14:05" or "2 days ago" means. The
// previous code called `new Date(x).toLocaleTimeString([], {...})` inline in
// four files with three different option sets.
//
// Timezone: Asia/Kolkata is the product's home market and the fallback, but
// the device's own zone wins when it has one — a user actually in Dubai
// should see Dubai times, not IST.
//
// Locale: always the -IN region (Indian date/number grouping is this
// product's convention regardless of UI language, matching money.ts's own
// choice of en-IN for currency), but the language subtag follows the
// active app language (docs/REMEDIATION.md §9.4) so month/weekday names
// and formatRelative's "ago"/"in" text render in Hindi when the UI is in
// Hindi, not just the numbers.
//
// Never render a raw date/timestamp field directly in JSX (`{trip.startDate}`)
// — that bug has recurred independently in seven screens across this
// project. Always go through one of the formatters below.
import i18n from '@/lib/i18n';

export const FALLBACK_TIME_ZONE = 'Asia/Kolkata';

function resolveLocale(): string {
  const lang = i18n.language?.split('-')[0] || 'en';
  return `${lang}-IN`;
}

function resolveTimeZone(): string {
  try {
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return deviceZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/** Coerce anything we might hold onto a valid Date, or null. */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(value: string | number | Date | null | undefined, options: Intl.DateTimeFormatOptions, fallback: string) {
  const d = toDate(value);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(resolveLocale(), { timeZone: resolveTimeZone(), ...options }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** "14 Aug 2026" */
export function formatDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  return format(value, { day: 'numeric', month: 'short', year: 'numeric' }, fallback);
}

/** "14 Aug" — for ranges and dense cards where the year is implied. */
export function formatDateShort(value: string | number | Date | null | undefined, fallback = '—'): string {
  return format(value, { day: 'numeric', month: 'short' }, fallback);
}

/** "2:05 pm" */
export function formatTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  return format(value, { hour: 'numeric', minute: '2-digit', hour12: true }, fallback);
}

/** "14 Aug 2026, 2:05 pm" */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  return format(
    value,
    { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
    fallback,
  );
}

/** "14 Aug – 19 Aug 2026", collapsing the repeated month/year. */
export function formatDateRange(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
  fallback = '—',
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return fallback;
  if (!s) return formatDate(e, fallback);
  if (!e) return formatDate(s, fallback);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${sameYear ? formatDateShort(s) : formatDate(s)} – ${formatDate(e)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "just now" / "5 min ago" / "3 h ago" / "2 d ago", and the forward-looking
 * equivalents ("in 3 d"). Past ~4 weeks it falls back to an absolute date,
 * because "in 87 d" is less useful than the date itself.
 */
export function formatRelative(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;

  const deltaMs = d.getTime() - Date.now();
  const abs = Math.abs(deltaMs);

  if (abs < MINUTE) return i18n.t('common.justNow');
  if (abs >= 4 * WEEK) return formatDate(d, fallback);

  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < HOUR
      ? [Math.round(deltaMs / MINUTE), 'minute']
      : abs < DAY
        ? [Math.round(deltaMs / HOUR), 'hour']
        : abs < WEEK
          ? [Math.round(deltaMs / DAY), 'day']
          : [Math.round(deltaMs / WEEK), 'week'];

  try {
    return new Intl.RelativeTimeFormat(resolveLocale(), { numeric: 'auto', style: 'short' }).format(amount, unit);
  } catch {
    // Same trimmed-ICU concern as money.ts. Each unit has its own key so
    // i18next's `_one`/`_other` plural suffixes pick the right English/
    // Hindi plural category, same as Intl.RelativeTimeFormat would have.
    const n = Math.abs(amount);
    const key = deltaMs < 0 ? `common.${unit}sAgo` : `common.in${unit.charAt(0).toUpperCase()}${unit.slice(1)}s`;
    return i18n.t(key, { count: n });
  }
}

/** True when the instant is on today's calendar date in the display zone. */
export function isToday(value: string | number | Date | null | undefined): boolean {
  const d = toDate(value);
  if (!d) return false;
  return formatDate(d) === formatDate(new Date());
}

/**
 * The label for a message bubble: the time for today, the date otherwise.
 * Chat used four separate inline `toLocaleTimeString` calls for this.
 */
export function formatMessageTimestamp(value: string | number | Date | null | undefined, fallback = ''): string {
  const d = toDate(value);
  if (!d) return fallback;
  return isToday(d) ? formatTime(d) : formatDateTime(d);
}

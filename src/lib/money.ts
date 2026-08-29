// The single money type and formatter (docs/REMEDIATION.md §0.2.2 /
// CONVENTIONS.md §3).
//
// Money crosses the wire as a STRING ("8500.00") because the server stores
// it as Postgres Decimal(12,2) and JS numbers lose precision on values a
// ledger cares about. Nothing in the app may format currency inline again:
// every `₹${x.toLocaleString('en-IN')}` in the codebase routes through
// formatINR instead, so the symbol, grouping, and rounding are decided once.

/**
 * A monetary amount. Strings are the transport form and the preferred one;
 * numbers are accepted because several client-side types still hold parsed
 * values, and rejecting them would mean a lossy migration in the same pass.
 */
export type Money = string | number;

/** Parse a Money into a number, or null when it is not a usable amount. */
export function parseMoney(value: Money | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface FormatMoneyOptions {
  /**
   * Show paise. Off by default: this product prices whole rupees, and
   * "₹8,500.00" reads as machine output next to "₹8,500".
   */
  showPaise?: boolean;
  /** What to render when the amount is missing or unparseable. */
  fallback?: string;
}

/**
 * The only currency formatter in the app. `"8500.00"` -> `"₹8,500"`.
 *
 * Uses the en-IN locale so grouping is lakh/crore style (₹1,50,000) rather
 * than the thousands grouping en-US would give (₹150,000).
 */
export function formatINR(value: Money | null | undefined, options: FormatMoneyOptions = {}): string {
  const { showPaise = false, fallback = '—' } = options;
  const n = parseMoney(value);
  if (n === null) return fallback;

  const fractionDigits = showPaise ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    // Hermes ships a trimmed ICU on some Android builds; en-IN currency
    // formatting can be unavailable there. Group manually rather than
    // showing a raw number.
    return `₹${groupIndian(showPaise ? n.toFixed(2) : String(Math.round(n)))}`;
  }
}

/**
 * A compact form for dense UI (cards, chips): ₹8.5K, ₹1.2L, ₹3.4Cr.
 * Uses Indian units, not K/M/B.
 */
export function formatINRCompact(value: Money | null | undefined, fallback = '—'): string {
  const n = parseMoney(value);
  if (n === null) return fallback;
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${trimZero(n / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `₹${trimZero(n / 1_00_000)}L`;
  if (abs >= 1_000) return `₹${trimZero(n / 1_000)}K`;
  return formatINR(n, { fallback });
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** Indian digit grouping (2,2,3) applied to an already-stringified number. */
function groupIndian(digits: string): string {
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  const [whole = '', fraction] = body.split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

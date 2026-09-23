/**
 * Indian mobile numbers — the same rules the server enforces
 * (backend/src/lib/indian-phone.ts), so the form rejects a number before it
 * ever reaches the API.
 *
 * Ten digits starting 6, 7, 8 or 9. A +91 / 91 / 0 prefix, spaces and dashes
 * are accepted and stripped; everything is sent as +91XXXXXXXXXX.
 */

const MOBILE_BODY = /^[6-9]\d{9}$/;

/** The 10-digit body with any prefix and separators removed. */
export function indianMobileDigits(input: string): string {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Canonical `+91XXXXXXXXXX`, or null if this is not a valid Indian mobile. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = indianMobileDigits(input);
  return MOBILE_BODY.test(digits) ? `+91${digits}` : null;
}

/** A user-facing reason the number is not acceptable, or null if it is. */
export function indianMobileError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Mobile number is required.';
  const digits = indianMobileDigits(trimmed);
  if (!/^\d+$/.test(digits)) return 'Mobile number can only contain digits.';
  if (digits.length !== 10) return 'Enter a 10-digit mobile number.';
  if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
  return null;
}

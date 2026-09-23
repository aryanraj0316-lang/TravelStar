/**
 * Indian mobile numbers, the only kind an account can be registered with.
 *
 * A valid number is ten digits starting 6, 7, 8 or 9 (the TRAI mobile
 * series; 1–5 are landlines and service codes). People type these with a
 * country code, a trunk-dialling zero, spaces or dashes, so all of those are
 * accepted and stripped. Everything is stored and compared in one canonical
 * E.164 form — +91XXXXXXXXXX — because the column is unique and "98765 43210"
 * and "+919876543210" must be recognised as the same number.
 */

const MOBILE_BODY = /^[6-9]\d{9}$/;

/** Canonical `+91XXXXXXXXXX`, or null if this is not a valid Indian mobile. */
export function normalizeIndianMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  return MOBILE_BODY.test(digits) ? `+91${digits}` : null;
}

export const INDIAN_MOBILE_ERROR =
  'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.';

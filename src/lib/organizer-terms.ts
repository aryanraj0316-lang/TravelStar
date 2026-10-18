// The organizer code of conduct shown before a trip is published or edited.
// The wording lives in the locale files (organizerTerms.clauses.<id>.title /
// .body); the canonical English and the version live on the server
// (backend/src/lib/organizer-terms.ts) — keep the version and clause ids in
// step with it. The server rejects any other version, so a stale app can
// never record acceptance of terms it didn't show.

export const ORGANIZER_TERMS_VERSION = '2026-10-18';

export const ORGANIZER_TERMS_CLAUSE_IDS = [
  'sober',
  'driving',
  'vehicle',
  'safety',
  'respect',
  'honest',
  'stays',
  'legal',
  'payments',
  'noone_left',
  'weather',
  'privacy',
  'environment',
  'truthful',
  'enforcement',
] as const;

export interface OrganizerAgreementInput {
  accepted: true;
  termsVersion: string;
  organizerDrives: boolean;
  drivingLicenceNumber?: string;
  vehicleRegistrationNumber?: string;
  language?: string;
}

export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// Same shapes the server enforces (see the backend module for the formats).
export function isValidDrivingLicence(value: string): boolean {
  return /^[A-Z]{2}[0-9A-Z]{8,14}$/.test(normalizeIdNumber(value));
}

export function isValidVehicleRegistration(value: string): boolean {
  return /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/.test(normalizeIdNumber(value));
}

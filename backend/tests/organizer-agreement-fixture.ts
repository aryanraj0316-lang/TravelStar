import { ORGANIZER_TERMS_VERSION } from '../src/lib/organizer-terms';

/** A valid organizer agreement — every trip must be created with one. */
export const TEST_ORGANIZER_AGREEMENT = {
  accepted: true as const,
  termsVersion: ORGANIZER_TERMS_VERSION,
  organizerDrives: false,
};

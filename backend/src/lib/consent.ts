// The single source of truth for what "the policy" means when a consent
// record is written (docs/REMEDIATION.md §12.3). Bump this whenever the
// hosted Terms/Privacy copy materially changes so old consent rows stay
// truthfully dated to the version the user actually saw. privacy.tsx and
// the generated public policy share versioned legal copy.
export const CURRENT_POLICY_VERSION = '2026-11-06';

// The permission categories this app actually requests. No KYC entry —
// identity verification was removed outright in §12.1, so there is nothing
// to consent to there. Mirrors the Prisma ConsentCategory enum; kept as a
// plain string tuple (not an import from the generated client) so the
// frontend's copy of this file has no Prisma dependency.
export const CONSENT_CATEGORIES = ['LOCATION', 'CAMERA', 'PHOTOS', 'NOTIFICATIONS'] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

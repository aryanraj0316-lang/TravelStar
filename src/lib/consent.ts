// Client half of explicit, granular consent capture (docs/REMEDIATION.md
// §12.3). CURRENT_POLICY_VERSION mirrors backend/src/lib/consent.ts's copy
// — kept as a plain duplicated constant rather than a shared import, per
// the standing decision that this app has no monorepo tooling to share
// code across the client/server boundary (§6.4). Bump both together
// whenever the hosted Terms/Privacy copy materially changes.
import { apiService, type ConsentCategory } from '@/services/api';
import { logger } from '@/lib/logger';

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = ['LOCATION', 'CAMERA', 'PHOTOS', 'NOTIFICATIONS'];
export const CURRENT_POLICY_VERSION = '2026-09-03-placeholder';

/**
 * Records a consent decision at the moment it's actually made — right
 * after an OS permission prompt resolves, or a settings toggle changes —
 * so the timestamp is truthful. Fire-and-forget and never throws: this is
 * a compliance side-record, not a gate, and a failed write here must never
 * block or roll back the permission grant or toggle it's describing.
 */
export function recordConsent(category: ConsentCategory, granted: boolean): void {
  apiService.recordConsent(category, granted, CURRENT_POLICY_VERSION).catch((e) => {
    logger.warn(`[Consent] Failed to record ${category}=${granted}:`, e);
  });
}

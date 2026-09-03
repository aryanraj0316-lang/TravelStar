import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { CONSENT_CATEGORIES, CURRENT_POLICY_VERSION } from '../../lib/consent';

const router = Router();

const recordConsentSchema = z.object({
  category: z.enum(CONSENT_CATEGORIES),
  granted: z.boolean(),
  // The client sends the version of the policy it showed the user when
  // asking — not just trusted blindly, but logged as reported. If it
  // drifts from CURRENT_POLICY_VERSION the row still records what the user
  // actually saw and agreed to, which is what an audit needs; the caller
  // isn't blocked from consenting under a version this server has since
  // moved past, and re-prompting a stale client is a UX decision, not a
  // validation one.
  policyVersion: z.string().trim().min(1).max(50),
});

// Append-only: every grant or revoke is its own row (docs/REMEDIATION.md
// §12.3). Never updates a previous record — the history is the audit trail.
router.post('/', async (req, res) => {
  const userId = requireUserId(req);
  const parsed = recordConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid consent record.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  try {
    const { category, granted, policyVersion } = parsed.data;
    const record = await prisma.consentRecord.create({
      data: { userId, category, granted, policyVersion },
    });
    return res.status(201).json({ ok: true, data: record });
  } catch (err) {
    logger.warn('[Consent] Failed to record consent:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to record consent.' } });
  }
});

// The caller's current state per category — the latest row, or null when
// that category has never been asked about yet — plus the server's current
// policy version, so the client knows whether a "granted" answer was given
// under an older policy and ought to be re-asked.
router.get('/', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const rows = await prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const latestByCategory: Record<string, (typeof rows)[number] | null> = {};
    for (const category of CONSENT_CATEGORIES) {
      latestByCategory[category] = rows.find((r) => r.category === category) ?? null;
    }

    return res.status(200).json({
      ok: true,
      data: { current: latestByCategory, policyVersion: CURRENT_POLICY_VERSION },
    });
  } catch (err) {
    logger.warn('[Consent] Failed to load consent state:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load consent state.' } });
  }
});

export default router;

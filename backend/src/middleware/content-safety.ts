import type { Request, Response, NextFunction } from 'express';
import { assertCanPost, filterSocial, safetySets } from '../services/content-safety';
import prisma from '../services/db';

const social = /^\/(feed|stories|guides|chats|trips|map)(\/|$)/;
const records = /\/(my-booking|pending-allocations|organizer-agreement|payment-summaries|expenses|receipts|earnings)(\/|$)/;

export async function contentSafety(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path.startsWith('/bookings') && typeof req.body?.guideProfileId === 'string') {
      const guide = await prisma.guideProfile.findUnique({ where: { id: req.body.guideProfileId }, select: { reviewOnly: true, userId: true } });
      if (guide?.reviewOnly && guide.userId !== req.user?.id) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide is unavailable.' } });
    }
    if (!social.test(req.path) || records.test(req.path)) return next();
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      // Existing users can still sign in, delete accounts, manage payments,
      // stop location sharing, and send SOS without accepting new rules.
      const publishes = /^(\/stories(\/(upload[^/]*|media-upload-url))?$|\/trips$|\/guides\/profile$|\/guides\/[^/]+\/(reels|reviews|quotes|packages)$|\/chats\/(dm|inquiry|attachments)$)/;
      if ((publishes.test(req.path) || /^\/trips\/[^/]+\/announcements$/.test(req.path) || (req.method === 'PUT' && /^\/(trips|guides)\/[^/]+$/.test(req.path))) && req.user) await assertCanPost(req.user.id);
    }
    if (req.method === 'GET' && !req.path.startsWith('/chats/attachments/')) {
      const sets = await safetySets(req.user?.id);
      const guideId = req.path.match(/^\/guides\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
      if (guideId) {
        const guide = await prisma.guideProfile.findUnique({ where: { id: guideId }, select: { reviewOnly: true, userId: true } });
        if (guide?.reviewOnly && guide.userId !== req.user?.id) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide is unavailable.' } });
      }
      const tripId = req.path.match(/^\/(?:map\/)?trips\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
      if (tripId) {
        const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { privacy: true, creatorId: true } });
        if (trip && trip.privacy !== 'PUBLIC' && trip.creatorId !== req.user?.id && !sets.privateTrips.has(tripId)) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Trip is unavailable.' } });
      }
      const json = res.json.bind(res);
      res.json = ((body: unknown) => {
        const payload = body as { ok?: boolean; data?: unknown };
        if (payload?.ok && 'data' in payload) {
          const filtered = filterSocial(payload.data, sets);
          if (filtered === null && payload.data && !Array.isArray(payload.data)) {
            res.status(404);
            return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Content is unavailable.' } });
          }
          return json({ ...payload, data: filtered });
        }
        return json(body);
      }) as Response['json'];
    }
    next();
  } catch (e) { next(e); }
}

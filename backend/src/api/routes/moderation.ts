import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../../services/db';
import { requireUserId } from '../../lib/auth-context';
import { CONTENT_KINDS, CONTENT_RULES, CONTENT_RULES_VERSION, resolveSafetyTarget } from '../../services/content-safety';
import { sendEmail } from '../../services/email';
import { logger } from '../../lib/logger';
import crypto from 'node:crypto';
import { normalizeIndianMobile } from '../../lib/indian-phone';
import { prepareReviewAccess } from '../../services/review-access';
import { isRazorpayConfigured } from '../../services/trip-payments';
import { isEmailConfigured } from '../../services/email';
import { legacyChatKey } from '../../lib/object-storage';

const router = Router();
const uuid = z.string().uuid();
const targetSchema = z.object({ kind: z.enum(CONTENT_KINDS), targetId: uuid });
const activateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

router.post('/activate', activateLimiter, async (req, res) => {
  const parsed = z.string().regex(/^[a-f0-9]{64}$/).safeParse(req.body?.code);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { message: 'Invalid activation code.' } });
  const tokenHash = crypto.createHash('sha256').update(parsed.data).digest('hex');
  const userId = requireUserId(req);
  const activated = await prisma.$transaction(async tx => {
    const claim = await tx.moderatorInvite.updateMany({ where: { tokenHash, consumedAt: null }, data: { consumedAt: new Date(), consumedBy: userId } });
    if (!claim.count) return false;
    await tx.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    return true;
  });
  if (!activated) return res.status(403).json({ ok: false, error: { message: 'Invalid or already-used activation code.' } });
  res.json({ ok: true, data: { activated: true } });
});

router.get('/target', async (req, res) => {
  const parsed = targetSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false });
  const target = await resolveSafetyTarget(parsed.data.kind, parsed.data.targetId, requireUserId(req));
  if (!target) return res.status(404).json({ ok: false });
  res.json({ ok: true, data: { id: parsed.data.targetId, label: target.label, authorId: target.authorId } });
});

router.get('/state', async (req, res) => {
  const userId = requireUserId(req);
  const [acceptance, user, status] = await Promise.all([
    prisma.contentAcceptance.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.userSafetyStatus.findUnique({ where: { userId } }),
  ]);
  res.json({ ok: true, data: { version: CONTENT_RULES_VERSION, rules: CONTENT_RULES, accepted: acceptance?.version === CONTENT_RULES_VERSION, isModerator: user?.role === 'ADMIN', suspended: status?.suspended ?? false } });
});

router.post('/accept', async (req, res) => {
  if (req.body?.version !== CONTENT_RULES_VERSION || req.body?.accepted !== true) return res.status(400).json({ ok: false, error: { code: 'INVALID_RULES', message: 'Read and accept the current content rules.' } });
  const userId = requireUserId(req);
  await prisma.contentAcceptance.upsert({ where: { userId }, create: { userId, version: CONTENT_RULES_VERSION }, update: { version: CONTENT_RULES_VERSION, acceptedAt: new Date() } });
  res.json({ ok: true, data: { accepted: true } });
});

router.get('/review-access', async (req, res) => {
  res.json({ ok: true, data: await prisma.reviewAccess.findUnique({ where: { userId: requireUserId(req) } }) });
});

router.get('/blocks', async (req, res) => {
  const rows = await prisma.userBlock.findMany({ where: { blockerId: requireUserId(req) }, include: { blocked: { select: { profile: { select: { firstName: true, lastName: true } } } } }, orderBy: { createdAt: 'desc' } });
  res.json({ ok: true, data: rows.map(b => ({ userId: b.blockedId, name: `${b.blocked.profile?.firstName ?? 'Member'} ${b.blocked.profile?.lastName ?? ''}`.trim() })) });
});

router.post('/blocks', async (req, res) => {
  const parsed = uuid.safeParse(req.body?.userId);
  const blockerId = requireUserId(req);
  if (!parsed.success || parsed.data === blockerId) return res.status(400).json({ ok: false, error: { code: 'INVALID_USER', message: 'Select another user to block.' } });
  const blockedId = parsed.data;
  if (!await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } })) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
  await prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} });
  req.app.get('socketio')?.to(blockerId).emit('safetyChanged');
  req.app.get('socketio')?.to(blockedId).emit('safetyChanged');
  res.json({ ok: true, data: { blocked: true } });
});

router.delete('/blocks/:id', async (req, res) => {
  const parsed = uuid.safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ ok: false });
  await prisma.userBlock.deleteMany({ where: { blockerId: requireUserId(req), blockedId: parsed.data } });
  res.json({ ok: true, data: { blocked: false } });
});

// The picker returns public names/content or content the caller can already
// access. It never reveals email addresses, phone numbers or other rooms.
router.get('/targets', async (req, res) => {
  const parsed = z.object({ kind: z.enum(CONTENT_KINDS), q: z.string().trim().max(100).default('') }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false });
  const { kind, q } = parsed.data;
  const userId = requireUserId(req);
  const contains = { contains: q, mode: 'insensitive' as const };
  let rows: { id: string; label: string; authorId: string | null }[] = [];
  if (kind === 'USER') {
    const users = await prisma.user.findMany({ where: { id: { not: userId }, profile: { is: { OR: [{ firstName: contains }, { lastName: contains }] } } }, select: { id: true, profile: { select: { firstName: true, lastName: true } } }, take: 30 });
    rows = users.map(u => ({ id: u.id, authorId: u.id, label: `${u.profile?.firstName ?? ''} ${u.profile?.lastName ?? ''}`.trim() || 'Member' }));
  } else if (kind === 'STORY') {
    rows = (await prisma.travelStory.findMany({ where: { title: contains }, select: { id: true, title: true, userId: true }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.title, authorId: r.userId }));
  } else if (kind === 'TRIP') {
    rows = (await prisma.trip.findMany({ where: { name: contains, OR: [{ privacy: 'PUBLIC' }, { creatorId: userId }, { members: { some: { userId } } }] }, select: { id: true, name: true, creatorId: true }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.name, authorId: r.creatorId }));
  } else if (kind === 'MESSAGE') {
    rows = (await prisma.message.findMany({ where: { isSystem: false, content: contains, chatRoom: { members: { some: { userId } } } }, select: { id: true, content: true, senderId: true }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.content?.slice(0, 180) || 'Chat attachment', authorId: r.senderId }));
  } else if (kind === 'GUIDE') {
    rows = (await prisma.guideProfile.findMany({ where: { OR: [{ reviewOnly: false }, { userId }], user: { profile: { is: { OR: [{ firstName: contains }, { lastName: contains }] } } } }, include: { user: { select: { profile: { select: { firstName: true, lastName: true } } } } }, take: 30 })).map(r => ({ id: r.id, label: `${r.user.profile?.firstName ?? ''} ${r.user.profile?.lastName ?? ''}`.trim() || 'Guide', authorId: r.userId }));
  } else if (kind === 'REEL') {
    rows = (await prisma.guideReel.findMany({ where: { caption: contains }, include: { guide: { select: { userId: true } } }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.caption ?? 'Guide video', authorId: r.guide.userId }));
  } else if (kind === 'REVIEW') {
    rows = (await prisma.review.findMany({ where: { comment: contains }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.comment.slice(0, 180), authorId: r.reviewerId }));
  } else if (kind === 'POST') {
    rows = (await prisma.groupPost.findMany({ where: { content: contains, group: { members: { some: { userId } } } }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.content.slice(0, 180), authorId: r.authorId }));
  } else {
    rows = (await prisma.groupComment.findMany({ where: { content: contains, post: { group: { members: { some: { userId } } } } }, take: 30, orderBy: { createdAt: 'desc' } })).map(r => ({ id: r.id, label: r.content.slice(0, 180), authorId: r.authorId }));
  }
  res.json({ ok: true, data: rows });
});

const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyGenerator: req => requireUserId(req), skip: () => process.env.NODE_ENV === 'test' });
router.post('/reports', reportLimiter, async (req, res) => {
  const parsed = targetSchema.extend({ reason: z.enum(['HARASSMENT', 'SEXUAL_CONTENT', 'VIOLENCE', 'HATE', 'SCAM', 'PRIVACY', 'CHILD_SAFETY', 'OTHER']), details: z.string().trim().max(2000).default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: 'INVALID_REPORT', message: 'Select a reason and valid content.' } });
  const reporterId = requireUserId(req);
  const { kind, targetId, reason, details } = parsed.data;
  const target = await resolveSafetyTarget(kind, targetId, reporterId);
  if (!target) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Content is unavailable to this account.' } });
  const duplicate = await prisma.safetyReport.findFirst({ where: { reporterId, kind, targetId, status: 'OPEN' } });
  if (duplicate) return res.json({ ok: true, data: { id: duplicate.id, status: duplicate.status } });
  const report = await prisma.safetyReport.create({ data: { reporterId, kind, targetId, reason, details, subjectUserId: target.authorId, evidence: target.evidence } });
  // The queue is the durable source of truth; email is only an alert and
  // must never turn a saved report into a false failure or leak evidence.
  void sendEmail({ to: '1bharatgo@gmail.com', subject: 'Yatrenzo safety report requires review', text: `Report ${report.id} (${reason}). Sign in to Safety & reports with a moderator account to review it.`, html: `<p>Safety report ${report.id} (${reason}). Review the moderator queue in Yatrenzo.</p>` }).catch(e => logger.warn('[Safety] Report alert failed', e));
  res.status(201).json({ ok: true, data: { id: report.id, status: report.status } });
});

router.get('/reports/mine', async (req, res) => res.json({ ok: true, data: await prisma.safetyReport.findMany({ where: { reporterId: requireUserId(req) }, select: { id: true, kind: true, reason: true, status: true, createdAt: true, resolution: true }, take: 50, orderBy: { createdAt: 'desc' } }) }));

router.use('/admin', async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: requireUserId(req) }, select: { role: true } });
  if (user?.role !== 'ADMIN') return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Moderator access required.' } });
  next();
});
router.get('/admin/reports', async (_req, res) => {
  const [open, recent] = await Promise.all([
    prisma.safetyReport.findMany({ where: { status: 'OPEN' }, take: 50, orderBy: { createdAt: 'asc' } }),
    prisma.safetyReport.findMany({ where: { status: { not: 'OPEN' } }, take: 50, orderBy: { reviewedAt: 'desc' } }),
  ]);
  res.json({ ok: true, data: [...open, ...recent] });
});

router.get('/admin/readiness', async (_req, res) => {
  const [privacy, legacy, erasures] = await Promise.all([
    prisma.privacyMaintenanceState.findUnique({ where: { id: 'private-chat-v1' } }),
    prisma.message.findMany({ where: { mediaUrl: { not: null }, NOT: { mediaUrl: { startsWith: 'chat-private:' } } }, select: { id: true, mediaUrl: true }, take: 100 }),
    prisma.legacyChatMediaErasure.count(),
  ]);
  res.json({ ok: true, data: { paymentsConfigured: isRazorpayConfigured(), passwordResetConfigured: isEmailConfigured(), privacyPhase: privacy?.phase ?? 'UNKNOWN', publicChatMediaRevoked: !!privacy?.completedAt, pendingPublicErasure: erasures, legacyMedia: legacy.map(m => { let host = 'local-or-inline'; try { host = new URL(m.mediaUrl!).hostname || host; } catch {} return { messageId: m.id, host, managedObject: !!legacyChatKey(m.mediaUrl!), inline: m.mediaUrl!.startsWith('data:image/') }; }) } });
});

router.post('/admin/review-access', async (req, res) => {
  const phoneNumber = typeof req.body?.phoneNumber === 'string' ? normalizeIndianMobile(req.body.phoneNumber) : null;
  if (!phoneNumber || req.body?.confirmReviewAccount !== true) return res.status(400).json({ ok: false, error: { message: 'Confirm the dedicated reviewer account and its registered number.' } });
  const reviewer = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true, role: true } });
  if (!reviewer || reviewer.role === 'ADMIN') return res.status(400).json({ ok: false, error: { message: 'Use an existing, separate non-admin reviewer account.' } });
  const fixture = await prepareReviewAccess(reviewer.id, requireUserId(req));
  res.json({ ok: true, data: fixture });
});

router.get('/admin/reports/:id/media', async (req, res) => {
  const report = await prisma.safetyReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ ok: false });
  const evidence = report.evidence as { mediaUrl?: string | null };
  let uri = evidence.mediaUrl ?? null;
  if (uri?.startsWith('chat-private:')) {
    const asset = await prisma.chatAttachment.findUnique({ where: { id: uri.slice('chat-private:'.length) } });
    uri = asset ? `data:${asset.contentType};base64,${asset.bytes.toString('base64')}` : null;
  } else if (uri && !uri.startsWith('https://')) uri = null;
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ok: true, data: { uri } });
});

router.post('/admin/reports/:id', async (req, res) => {
  const parsed = z.object({ action: z.enum(['DISMISS', 'HIDE', 'SUSPEND', 'RESTORE']), note: z.string().trim().min(5).max(1000) }).safeParse(req.body);
  if (!parsed.success || !uuid.safeParse(req.params.id).success) return res.status(400).json({ ok: false });
  const report = await prisma.safetyReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ ok: false });
  const reviewer = requireUserId(req);
  const { action, note } = parsed.data;
  if (action === 'SUSPEND' && (!report.subjectUserId || report.subjectUserId === reviewer)) return res.status(400).json({ ok: false, error: { message: 'Cannot suspend this account.' } });
  if (action === 'HIDE' && report.kind === 'USER') return res.status(400).json({ ok: false, error: { message: 'Use suspend for an account report.' } });
  await prisma.$transaction(async tx => {
    await tx.moderationAction.create({ data: { reportId: report.id, actorId: reviewer, action, note } });
    if (action === 'HIDE') await tx.hiddenContent.upsert({ where: { kind_targetId: { kind: report.kind, targetId: report.targetId } }, create: { kind: report.kind, targetId: report.targetId, reason: note, reviewedBy: reviewer }, update: { reason: note, reviewedBy: reviewer } });
    if (action === 'SUSPEND' && report.subjectUserId) await tx.userSafetyStatus.upsert({ where: { userId: report.subjectUserId }, create: { userId: report.subjectUserId, suspended: true, reason: note }, update: { suspended: true, reason: note } });
    if (action === 'RESTORE') {
      await tx.hiddenContent.deleteMany({ where: { kind: report.kind, targetId: report.targetId } });
      if (report.subjectUserId) await tx.userSafetyStatus.updateMany({ where: { userId: report.subjectUserId }, data: { suspended: false, reason: note } });
    }
    await tx.safetyReport.update({ where: { id: report.id }, data: { status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', resolution: `${action}: ${note}`, reviewedBy: reviewer, reviewedAt: new Date() } });
  });
  const io = req.app.get('socketio');
  io?.emit('safetyChanged');
  if (action === 'SUSPEND' && report.subjectUserId) io?.in(report.subjectUserId).disconnectSockets(true);
  res.json({ ok: true, data: { reviewed: true } });
});

export default router;

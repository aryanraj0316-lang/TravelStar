import { ApiError } from '../lib/http';
import prisma from './db';

export const CONTENT_RULES_VERSION = '2026-11-07';
export const CONTENT_KINDS = ['USER', 'STORY', 'TRIP', 'GUIDE', 'REEL', 'MESSAGE', 'POST', 'COMMENT', 'REVIEW'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_RULES = 'No nudity or sexual exploitation, graphic violence, threats, harassment, hate, scams, illegal activity, or disclosure of another person\'s private information. Report violations using Safety & reports. We review reports and may remove content or suspend accounts. Blocking hides a person\'s social content and stops direct contact; existing booking and refund obligations remain.';

export async function blockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  return !!(await prisma.userBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } }));
}

export async function safetySets(viewerId?: string) {
  const [blocks, hidden, suspended, privateTrips] = await Promise.all([
    viewerId ? prisma.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] } }) : [],
    prisma.hiddenContent.findMany({ select: { targetId: true } }),
    prisma.userSafetyStatus.findMany({ where: { suspended: true }, select: { userId: true } }),
    viewerId ? prisma.trip.findMany({ where: { privacy: { not: 'PUBLIC' }, OR: [{ creatorId: viewerId }, { members: { some: { userId: viewerId } } }] }, select: { id: true } }) : [],
  ]);
  return {
    users: new Set([...blocks.map(b => b.blockerId === viewerId ? b.blockedId : b.blockerId), ...suspended.map(s => s.userId)]),
    content: new Set(hidden.map(h => h.targetId)),
    viewerId,
    privateTrips: new Set(privateTrips.map(t => t.id)),
  };
}

/** Applies to social displays, never to financial records or account exports. */
export function filterSocial(value: unknown, sets: { users: Set<string>; content: Set<string>; viewerId?: string | undefined; privateTrips?: Set<string> }): unknown {
  if (Array.isArray(value)) return value.map(v => filterSocial(v, sets)).filter(v => v !== null);
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  if ((row.privacy === 'PRIVATE' || row.privacy === 'INVITE_ONLY') && row.creatorId !== sets.viewerId && !sets.privateTrips?.has(String(row.id))) return null;
  if ((typeof row.id === 'string' && (sets.content.has(row.id) || sets.users.has(row.id))) ||
    ['userId', 'senderId', 'creatorId', 'authorId', 'reviewerId', 'ownerId', 'contactUserId'].some(k => typeof row[k] === 'string' && sets.users.has(row[k] as string))) return null;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, filterSocial(v, sets)]));
}

export async function assertCanPost(userId: string) {
  const [state, acceptance] = await Promise.all([
    prisma.userSafetyStatus.findUnique({ where: { userId } }),
    prisma.contentAcceptance.findUnique({ where: { userId } }),
  ]);
  if (state?.suspended) throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Contact support to appeal.');
  if (acceptance?.version !== CONTENT_RULES_VERSION) throw new ApiError(403, 'CONTENT_RULES_REQUIRED', 'Please accept the current content rules in Safety & reports before posting.');
}

export async function assertRoomContact(roomId: string, userId: string) {
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { isGroup: true, members: { select: { userId: true } } } });
  if (!room) return;
  // Group messages are delivered only to non-blocking recipients; a blocked
  // peer cannot make an entire trip's group unusable for everyone else.
  if (!room.isGroup) {
    for (const peer of room.members) if (await blockedBetween(userId, peer.userId)) {
      throw new ApiError(403, 'CONTACT_BLOCKED', 'Direct contact is unavailable for this account.');
    }
  }
}

/** Resolve identity and evidence server-side. Private messages/posts require membership. */
export async function resolveSafetyTarget(kind: ContentKind, id: string, viewer: string) {
  let authorId: string | null = null;
  let label = '';
  let text = '';
  let mediaUrl: string | null = null;
  let mediaType = 'IMAGE';
  switch (kind) {
    case 'USER': {
      const u = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
      if (!u) return null;
      authorId = u.id; label = `${u.profile?.firstName ?? 'Member'} ${u.profile?.lastName ?? ''}`.trim(); text = u.profile?.bio ?? '';
      break;
    }
    case 'STORY': {
      const r = await prisma.travelStory.findUnique({ where: { id } }); if (!r) return null;
      authorId = r.userId; label = r.title; text = r.content; mediaUrl = r.mediaUrl ?? r.coverImg; mediaType = r.mediaType; break;
    }
    case 'TRIP': {
      const r = await prisma.trip.findFirst({ where: { id, OR: [{ privacy: 'PUBLIC' }, { creatorId: viewer }, { members: { some: { userId: viewer } } }] } }); if (!r) return null;
      authorId = r.creatorId; label = r.name; text = r.description ?? ''; break;
    }
    case 'GUIDE': {
      const r = await prisma.guideProfile.findUnique({ where: { id } }); if (!r || (r.reviewOnly && r.userId !== viewer)) return null;
      authorId = r.userId; label = 'Guide profile'; break;
    }
    case 'REEL': {
      const r = await prisma.guideReel.findUnique({ where: { id }, include: { guide: true } }); if (!r) return null;
      authorId = r.guide.userId; label = r.caption ?? 'Guide video'; mediaUrl = r.videoUrl; mediaType = 'VIDEO'; break;
    }
    case 'MESSAGE': {
      const r = await prisma.message.findFirst({ where: { id, chatRoom: { members: { some: { userId: viewer } } } } }); if (!r || r.isSystem) return null;
      authorId = r.senderId; label = 'Chat message'; text = r.content ?? ''; mediaUrl = r.mediaUrl; break;
    }
    case 'POST': {
      const r = await prisma.groupPost.findFirst({ where: { id, group: { members: { some: { userId: viewer } } } } }); if (!r) return null;
      authorId = r.authorId; label = 'Group post'; text = r.content; mediaUrl = r.imageUrl; break;
    }
    case 'COMMENT': {
      const r = await prisma.groupComment.findFirst({ where: { id, post: { group: { members: { some: { userId: viewer } } } } } }); if (!r) return null;
      authorId = r.authorId; label = 'Group comment'; text = r.content; break;
    }
    case 'REVIEW': {
      const r = await prisma.review.findUnique({ where: { id } }); if (!r) return null;
      authorId = r.reviewerId; label = 'Guide review'; text = r.comment; break;
    }
  }
  return { authorId, label, evidence: { label, text: text.slice(0, 5000), mediaUrl, mediaType } };
}

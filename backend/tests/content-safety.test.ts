import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { io as connect, type Socket } from 'socket.io-client';
import app from '../src/app';
import prisma from '../src/services/db';
import { createSocketServer } from '../src/socket-server';
import { uniqueTestPhone } from './test-phone';
import { CONTENT_RULES_VERSION, filterSocial } from '../src/services/content-safety';

jest.mock('../src/services/email', () => ({ sendEmail: jest.fn().mockResolvedValue({ sent: false }), isEmailConfigured: () => true }));
const users: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function user(name: string, accepted = true) {
  const r = await request(app).post('/api/v1/auth/register').send({ termsAccepted: accepted, name, email: `safety-${randomUUID()}@example.invalid`, phoneNumber: uniqueTestPhone(), password: 'Safety-fixture-pass-1' });
  expect(r.status).toBe(201);
  users.push(r.body.data.user.id);
  return { id: r.body.data.user.id as string, token: r.body.data.token as string };
}
let owner: Awaited<ReturnType<typeof user>>, peer: typeof owner, moderator: typeof owner, outsider: typeof owner;
let storyId: string, roomId: string, messageId: string, reportId: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Safety fixtures require an isolated local database.');
  owner = await user('Safety Owner'); peer = await user('Safety Peer'); moderator = await user('Safety Moderator'); outsider = await user('Safety Outsider');
  await prisma.user.update({ where: { id: moderator.id }, data: { role: 'ADMIN' } });
  const story = await prisma.travelStory.create({ data: { userId: owner.id, authorName: 'Safety Owner', title: 'Safety fixture', content: 'Reported fixture text', location: 'Test' } }); storyId = story.id;
  const room = await request(app).post('/api/v1/chats/dm').set(auth(owner.token)).send({ userId: peer.id });
  expect(room.status).toBe(201); roomId = room.body.data.chatRoomId;
  const msg = await prisma.message.create({ data: { chatRoomId: roomId, senderId: owner.id, content: 'Safety chat fixture', mediaType: 'NONE' } }); messageId = msg.id;
});
afterAll(async () => {
  await prisma.hiddenContent.deleteMany({ where: { targetId: { in: [storyId, messageId].filter(Boolean) } } });
  await prisma.safetyReport.deleteMany({ where: { reporterId: { in: users } } });
  await prisma.moderationAction.deleteMany({ where: { actorId: { in: users } } });
  await prisma.booking.deleteMany({ where: { OR: [{ userId: { in: users } }, { guide: { userId: { in: users } } }] } });
  await prisma.trip.deleteMany({ where: { creatorId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test('unaccepted users can browse but cannot publish until accepting current rules', async () => {
  const newcomer = await user('Unaccepted Safety', false);
  const denied = await request(app).post('/api/v1/stories').set(auth(newcomer.token)).send({});
  expect(denied.status).toBe(403); expect(denied.body.error.code).toBe('CONTENT_RULES_REQUIRED');
  expect((await request(app).post('/api/v1/moderation/accept').set(auth(newcomer.token)).send({ version: 'old', accepted: true })).status).toBe(400);
  expect((await request(app).post('/api/v1/moderation/accept').set(auth(newcomer.token)).send({ version: CONTENT_RULES_VERSION, accepted: true })).status).toBe(200);
  const passedGate = await request(app).post('/api/v1/stories').set(auth(newcomer.token)).send({});
  expect(passedGate.status).toBe(201);
});

test('report queue captures server-side evidence, is idempotent and private', async () => {
  const body = { kind: 'STORY', targetId: storyId, reason: 'HARASSMENT', details: 'Please review fixture' };
  const report = await request(app).post('/api/v1/moderation/reports').set(auth(peer.token)).send(body);
  expect(report.status).toBe(201); reportId = report.body.data.id;
  const duplicate = await request(app).post('/api/v1/moderation/reports').set(auth(peer.token)).send(body);
  expect(duplicate.body.data.id).toBe(reportId);
  expect((await request(app).get('/api/v1/moderation/admin/reports').set(auth(peer.token))).status).toBe(403);
  const queue = await request(app).get('/api/v1/moderation/admin/reports').set(auth(moderator.token));
  expect(queue.body.data.find((r: { id: string }) => r.id === reportId).evidence.text).toBe('Reported fixture text');
});

test('private message reports require room membership', async () => {
  const report = await request(app).post('/api/v1/moderation/reports').set(auth(outsider.token)).send({ kind: 'MESSAGE', targetId: messageId, reason: 'OTHER' });
  expect(report.status).toBe(404);
  const picker = await request(app).get('/api/v1/moderation/targets?kind=MESSAGE&q=Safety').set(auth(outsider.token));
  expect(picker.body.data).toEqual([]);
});

test('blocking hides social history, denies new direct chats and denies private attachments', async () => {
  const asset = await prisma.chatAttachment.create({ data: { ownerId: owner.id, chatRoomId: roomId, bytes: Buffer.from('fixture'), contentType: 'image/png' } });
  expect((await request(app).post('/api/v1/moderation/blocks').set(auth(peer.token)).send({ userId: owner.id })).status).toBe(200);
  expect((await request(app).post('/api/v1/chats/dm').set(auth(owner.token)).send({ userId: peer.id })).status).toBe(403);
  expect((await request(app).get(`/api/v1/chats/attachments/${asset.id}`).set(auth(peer.token))).status).toBe(404);
  const stories = await request(app).get('/api/v1/stories').set(auth(peer.token));
  expect(JSON.stringify(stories.body.data)).not.toContain(storyId);
  expect((await request(app).post('/api/v1/moderation/blocks').set(auth(peer.token)).send({ userId: peer.id })).status).toBe(400);
});

test('an already connected socket cannot send through a block', async () => {
  const http = createServer(app); const io = createSocketServer(http); let socket: Socket | undefined;
  try {
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    const address = http.address() as { port: number };
    socket = connect(`http://127.0.0.1:${address.port}`, { auth: { token: owner.token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => { socket!.once('connect', resolve); socket!.once('connect_error', reject); });
    const error = new Promise<{ message: string }>(resolve => socket!.once('sendMessageError', resolve));
    socket.emit('sendMessage', { chatRoomId: roomId, content: 'must not be saved' });
    expect((await error).message).toContain('Direct contact');
    expect(await prisma.message.count({ where: { chatRoomId: roomId, content: 'must not be saved' } })).toBe(0);
  } finally { socket?.disconnect(); await new Promise<void>(resolve => io.close(() => resolve())); }
});

test('unblock restores direct contact and only removes the caller\'s block', async () => {
  expect((await request(app).delete(`/api/v1/moderation/blocks/${owner.id}`).set(auth(outsider.token))).status).toBe(200);
  expect((await request(app).post('/api/v1/chats/dm').set(auth(owner.token)).send({ userId: peer.id })).status).toBe(403);
  await request(app).delete(`/api/v1/moderation/blocks/${owner.id}`).set(auth(peer.token));
  expect((await request(app).post('/api/v1/chats/dm').set(auth(owner.token)).send({ userId: peer.id })).status).toBe(200);
});

test('moderation removes content globally without deleting financial or audit records', async () => {
  const action = await request(app).post(`/api/v1/moderation/admin/reports/${reportId}`).set(auth(moderator.token)).send({ action: 'HIDE', note: 'Fixture violates content rules' });
  expect(action.status).toBe(200);
  const feed = await request(app).get('/api/v1/feed');
  expect(JSON.stringify(feed.body.data)).not.toContain(storyId);
  expect(await prisma.travelStory.findUnique({ where: { id: storyId } })).not.toBeNull();
  const mine = await request(app).get('/api/v1/moderation/reports/mine').set(auth(peer.token));
  expect(mine.body.data.find((r: { id: string }) => r.id === reportId).status).toBe('ACTIONED');
});

test('one-time moderator activation cannot be reused or guessed', async () => {
  const code = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const tokenHash = createHash('sha256').update(code).digest('hex');
  await prisma.moderatorInvite.create({ data: { tokenHash } });
  try {
    expect((await request(app).post('/api/v1/moderation/activate').set(auth(outsider.token)).send({ code: '0'.repeat(64) })).status).toBe(403);
    expect((await request(app).post('/api/v1/moderation/activate').set(auth(outsider.token)).send({ code })).status).toBe(200);
    expect((await request(app).post('/api/v1/moderation/activate').set(auth(peer.token)).send({ code })).status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: outsider.id } }))?.role).toBe('ADMIN');
  } finally { await prisma.moderatorInvite.delete({ where: { tokenHash } }); }
});

test('nested content filtering removes blocked authors and hidden media references', () => {
  const result = filterSocial({ items: [{ id: 'a', userId: 'blocked' }, { id: 'b', messages: [{ id: 'hidden', mediaUrl: 'secret' }, { id: 'visible' }] }] }, { users: new Set(['blocked']), content: new Set(['hidden']) });
  expect(result).toEqual({ items: [{ id: 'b', messages: [{ id: 'visible' }] }] });
});

test('reviewer fixtures are private, complimentary, idempotent and do not grant admin or claim payment', async () => {
  const reviewer = await user('Dedicated Safety Reviewer');
  const phone = (await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } })).phoneNumber;
  const denied = await request(app).post('/api/v1/moderation/admin/review-access').set(auth(peer.token)).send({ phoneNumber: phone, confirmReviewAccount: true });
  expect(denied.status).toBe(403);
  const setup = await request(app).post('/api/v1/moderation/admin/review-access').set(auth(moderator.token)).send({ phoneNumber: phone, confirmReviewAccount: true });
  expect(setup.status).toBe(200);
  const tripId = setup.body.data.travellerTripId;
  expect((await request(app).post('/api/v1/moderation/admin/review-access').set(auth(moderator.token)).send({ phoneNumber: phone, confirmReviewAccount: true })).body.data.travellerTripId).toBe(tripId);
  expect((await request(app).get(`/api/v1/trips/${tripId}`).set(auth(reviewer.token))).status).toBe(200);
  expect((await request(app).get(`/api/v1/trips/${tripId}`)).status).toBe(404);
  const listing = await request(app).get('/api/v1/trips');
  expect(JSON.stringify(listing.body.data)).not.toContain(tripId);
  expect((await request(app).get(`/api/v1/trips/${tripId}/my-booking`).set(auth(reviewer.token))).body.data.payment).toBeNull();
  expect(await prisma.tripPaymentOrder.count({ where: { userId: reviewer.id } })).toBe(0);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } })).role).toBe('TOURIST');
  const guide = await prisma.guideProfile.findUniqueOrThrow({ where: { userId: reviewer.id } });
  expect(guide.verifiedStatus).toBe('PENDING');
  expect((await request(app).get(`/api/v1/guides/${guide.id}/packages`)).status).toBe(404);
});

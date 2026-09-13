import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Per-message SENT / DELIVERED / SEEN.
 *
 * MessageReadReceipt alone could only ever say "seen" — with no record of a
 * message reaching a device, a sender's ticks cannot distinguish "the server
 * has it" from "their phone has it", so the single-tick/double-tick
 * distinction was not representable at all.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdRoomIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-msgstatus-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Status ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createRoom(memberIds: string[], name: string): Promise<string> {
  const room = await prisma.chatRoom.create({
    data: {
      name,
      isGroup: memberIds.length > 2,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  createdRoomIds.push(room.id);
  return room.id;
}

async function sendMessage(roomId: string, senderId: string, content: string): Promise<string> {
  const msg = await prisma.message.create({
    data: { chatRoomId: roomId, senderId, content, mediaType: 'NONE' },
  });
  return msg.id;
}

async function statusOf(token: string, roomId: string, messageId: string): Promise<string | null> {
  const res = await request(app)
    .get(`/api/v1/chats/${roomId}/messages?take=50`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  const found = (res.body.data as { id: string; status: string | null }[]).find((m) => m.id === messageId);
  return found?.status ?? null;
}

afterAll(async () => {
  await prisma.chatRoom.deleteMany({ where: { id: { in: createdRoomIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Message delivery and read status', () => {
  it('moves a DM message from SENT to DELIVERED to SEEN', async () => {
    const alice = await registerAndLogin('alice');
    const bob = await registerAndLogin('bob');
    const roomId = await createRoom([alice.userId, bob.userId], `DM ${runId}`);
    const messageId = await sendMessage(roomId, alice.userId, 'Are you there?');

    expect(await statusOf(alice.token, roomId, messageId)).toBe('SENT');

    // Bob's device receives it.
    const delivered = await request(app)
      .post(`/api/v1/chats/${roomId}/delivered`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.delivered).toBe(1);

    expect(await statusOf(alice.token, roomId, messageId)).toBe('DELIVERED');

    // Bob opens the room.
    const read = await request(app)
      .post(`/api/v1/chats/${roomId}/read`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(read.status).toBe(200);

    expect(await statusOf(alice.token, roomId, messageId)).toBe('SEEN');

    // Status is the sender's own business — Bob gets none on Alice's message.
    expect(await statusOf(bob.token, roomId, messageId)).toBeNull();
  }, 60_000);

  it('holds a group message at DELIVERED until every recipient has read it', async () => {
    const author = await registerAndLogin('gauthor');
    const first = await registerAndLogin('gfirst');
    const second = await registerAndLogin('gsecond');
    const roomId = await createRoom([author.userId, first.userId, second.userId], `Group ${runId}`);
    const messageId = await sendMessage(roomId, author.userId, 'Meeting at 7');

    expect(await statusOf(author.token, roomId, messageId)).toBe('SENT');

    await request(app).post(`/api/v1/chats/${roomId}/delivered`).set('Authorization', `Bearer ${first.token}`);
    // One of two recipients has it — not DELIVERED yet under the
    // all-recipients rule.
    expect(await statusOf(author.token, roomId, messageId)).toBe('SENT');

    await request(app).post(`/api/v1/chats/${roomId}/delivered`).set('Authorization', `Bearer ${second.token}`);
    expect(await statusOf(author.token, roomId, messageId)).toBe('DELIVERED');

    await request(app).post(`/api/v1/chats/${roomId}/read`).set('Authorization', `Bearer ${first.token}`);
    // Still DELIVERED: the second recipient has not opened the room.
    expect(await statusOf(author.token, roomId, messageId)).toBe('DELIVERED');

    await request(app).post(`/api/v1/chats/${roomId}/read`).set('Authorization', `Bearer ${second.token}`);
    expect(await statusOf(author.token, roomId, messageId)).toBe('SEEN');
  }, 90_000);

  it('never counts a user\'s own message in their own unread count', async () => {
    const alice = await registerAndLogin('selfunread');
    const bob = await registerAndLogin('selfunreadpeer');
    const roomId = await createRoom([alice.userId, bob.userId], `Self ${runId}`);
    await sendMessage(roomId, alice.userId, 'My own message');

    const chats = await request(app).get('/api/v1/chats').set('Authorization', `Bearer ${alice.token}`);
    expect(chats.status).toBe(200);
    const room = (chats.body.data as { id: string; unreadCount: number }[]).find((r) => r.id === roomId);
    expect(room?.unreadCount).toBe(0);
  }, 60_000);

  it('refuses receipts and message info from outside the room', async () => {
    const alice = await registerAndLogin('owner2');
    const bob = await registerAndLogin('peer2');
    const outsider = await registerAndLogin('outsider2');
    const roomId = await createRoom([alice.userId, bob.userId], `Closed ${runId}`);
    const messageId = await sendMessage(roomId, alice.userId, 'Private');

    const delivered = await request(app)
      .post(`/api/v1/chats/${roomId}/delivered`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(delivered.status).toBe(403);

    const info = await request(app)
      .get(`/api/v1/chats/${roomId}/messages/${messageId}/info`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(info.status).toBe(403);

    // Message info is the sender's own: Bob is in the room but did not send it.
    const notSender = await request(app)
      .get(`/api/v1/chats/${roomId}/messages/${messageId}/info`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(notSender.status).toBe(403);

    const asSender = await request(app)
      .get(`/api/v1/chats/${roomId}/messages/${messageId}/info`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(asSender.status).toBe(200);
    expect(asSender.body.data).toHaveLength(1);
    expect(asSender.body.data[0].userId).toBe(bob.userId);
  }, 60_000);
});

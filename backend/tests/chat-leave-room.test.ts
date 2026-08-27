import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for DELETE /api/v1/chats/:id/members/me
 * (docs/REMEDIATION.md §8.7).
 *
 * chat.tsx's "Leave Group"/"Exit Group" used to only call
 * setInboxRooms((prev) => prev.filter(...)): a client-side-only list hide.
 * The caller was still a real ChatRoomMember row, so the "left" group would
 * simply reappear the next time the inbox refetched from the server.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdChatRoomIds: string[] = [];
const createdTripIds: string[] = [];

async function registerUser(label: string): Promise<{ id: string; token: string }> {
  const email = `test-leaveroom-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `LeaveRoom ${label}`, email, password: 'correcthorsebattery' });
  return { id: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  // ChatRoom holds the FK to Trip (ChatRoom.tripId), so it must go first;
  // Trip in turn holds a RESTRICT FK to its creator, so it must go before
  // the user.
  await prisma.chatRoom.deleteMany({ where: { id: { in: createdChatRoomIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('DELETE /api/v1/chats/:id/members/me', () => {
  it('rejects an unauthenticated request', async () => {
    const room = await prisma.chatRoom.create({ data: { isGroup: true, name: 'Unauth Test Room' } });
    createdChatRoomIds.push(room.id);

    const res = await request(app).delete(`/api/v1/chats/${room.id}/members/me`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-member (403), same posture as reading the room', async () => {
    const outsider = await registerUser('outsider');
    const room = await prisma.chatRoom.create({ data: { isGroup: true, name: 'Members Only Room' } });
    createdChatRoomIds.push(room.id);

    const res = await request(app)
      .delete(`/api/v1/chats/${room.id}/members/me`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  it('removes the real ChatRoomMember row — the room does not reappear from GET /chats', async () => {
    const member = await registerUser('member');
    const room = await prisma.chatRoom.create({ data: { isGroup: true, name: 'Real Leave Room' } });
    createdChatRoomIds.push(room.id);
    await prisma.chatRoomMember.create({ data: { chatRoomId: room.id, userId: member.id } });

    const before = await request(app).get('/api/v1/chats').set('Authorization', `Bearer ${member.token}`);
    expect(before.body.data.some((r: { id: string }) => r.id === room.id)).toBe(true);

    const leaveRes = await request(app)
      .delete(`/api/v1/chats/${room.id}/members/me`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(leaveRes.status).toBe(200);

    // The membership row is really gone, not just hidden client-side.
    const membership = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId: room.id, userId: member.id } },
    });
    expect(membership).toBeNull();

    const after = await request(app).get('/api/v1/chats').set('Authorization', `Bearer ${member.token}`);
    expect(after.body.data.some((r: { id: string }) => r.id === room.id)).toBe(false);
  });

  it('lets an organizer leave their own trip group chat (leaving is not restricted to non-organizers)', async () => {
    const organizer = await registerUser('organizer');
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `LeaveRoom Trip ${runId}`,
        cities: ['Jaipur'],
        startDate,
        endDate,
        budget: 5000,
        totalSeats: 4,
        meetingPoint: 'Jaipur Jn',
        privacy: 'PUBLIC',
      });
    expect(tripRes.status).toBe(201);
    createdTripIds.push(tripRes.body.data.id);
    const chatRoomId = tripRes.body.data.chatRoomId as string;
    createdChatRoomIds.push(chatRoomId);

    const res = await request(app)
      .delete(`/api/v1/chats/${chatRoomId}/members/me`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(200);
  });
});

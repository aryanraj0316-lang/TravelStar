import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Pre-join enquiry threads.
 *
 * A ChatRoom was either a trip's group room (tripId, @unique) or a nameless
 * DM, so an organizer receiving a question had no way to tell which of
 * their trips it was about, and the thread could not be listed alongside
 * that trip's join requests. inquiryTripId/inquiryUserId attribute the
 * thread, and their unique pair is what stops repeated taps of "Ask the
 * organizer" spawning duplicate conversations.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-inquiry-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Inquiry ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      cities: ['Jaipur'],
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 6000,
      totalSeats: 5,
      meetingPoint: 'Jaipur Jn',
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id;
}

afterAll(async () => {
  await prisma.chatRoom.deleteMany({ where: { inquiryTripId: { in: createdTripIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Trip enquiries', () => {
  it('opens one thread however many times the traveller asks', async () => {
    const organizer = await registerAndLogin('organizer');
    const tourist = await registerAndLogin('tourist');
    const tripId = await createTrip(organizer.token, `Enquiry Trip ${runId}`);

    const first = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    expect(second.status).toBe(200);
    expect(second.body.data.chatRoomId).toBe(first.body.data.chatRoomId);

    expect(await prisma.chatRoom.count({ where: { inquiryTripId: tripId } })).toBe(1);

    // Both parties are in it, and nobody else.
    const members = await prisma.chatRoomMember.findMany({
      where: { chatRoomId: first.body.data.chatRoomId },
      select: { userId: true },
    });
    expect(members.map((m) => m.userId).sort()).toEqual([organizer.userId, tourist.userId].sort());
  }, 90_000);

  it('refuses an organizer opening an enquiry with themselves', async () => {
    const organizer = await registerAndLogin('selforganizer');
    const tripId = await createTrip(organizer.token, `Self Enquiry ${runId}`);

    const res = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ tripId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_INQUIRY');
  }, 60_000);

  it('lists enquiries for the organizer, including someone with no join request', async () => {
    const organizer = await registerAndLogin('listorganizer');
    const asker = await registerAndLogin('asker');
    const tripId = await createTrip(organizer.token, `List Enquiries ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    await prisma.message.create({
      data: { chatRoomId, senderId: asker.userId, content: 'Is there room for a late joiner?', mediaType: 'NONE' },
    });

    const list = await request(app)
      .get(`/api/v1/trips/${tripId}/inquiries`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const thread = list.body.data[0];
    expect(thread.chatRoomId).toBe(chatRoomId);
    expect(thread.user.id).toBe(asker.userId);
    expect(thread.lastMessage).toBe('Is there room for a late joiner?');
    expect(thread.unreadCount).toBe(1);
    // Asked a question, never requested a seat — still visible.
    expect(thread.hasJoinRequest).toBe(false);
    expect(thread.joinRequestStatus).toBeNull();
  }, 90_000);

  it('shows the join request status alongside the enquiry once one exists', async () => {
    const organizer = await registerAndLogin('statusorganizer');
    const asker = await registerAndLogin('statusasker');
    const tripId = await createTrip(organizer.token, `Status Enquiries ${runId}`);

    await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ tripId });

    await request(app)
      .post('/api/v1/interactions/join-request')
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ tripId });

    const list = await request(app)
      .get(`/api/v1/trips/${tripId}/inquiries`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data[0].hasJoinRequest).toBe(true);
    expect(list.body.data[0].joinRequestStatus).toBe('PENDING');
  }, 90_000);

  it('keeps the enquiry list and its messages away from everyone else', async () => {
    const organizer = await registerAndLogin('privateorganizer');
    const asker = await registerAndLogin('privateasker');
    const outsider = await registerAndLogin('privateoutsider');
    const tripId = await createTrip(organizer.token, `Private Enquiries ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    const listAsOutsider = await request(app)
      .get(`/api/v1/trips/${tripId}/inquiries`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(listAsOutsider.status).toBe(403);

    // And the thread's own messages stay behind assertChatRoomMember.
    const messagesAsOutsider = await request(app)
      .get(`/api/v1/chats/${chatRoomId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(messagesAsOutsider.status).toBe(403);

    const messagesAsOrganizer = await request(app)
      .get(`/api/v1/chats/${chatRoomId}/messages`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(messagesAsOrganizer.status).toBe(200);
  }, 90_000);
});

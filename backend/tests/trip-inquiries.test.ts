import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { notifyTripEnquiry } from '../src/services/trip-enquiry-notifications';
import { uniqueTestPhone } from './test-phone';

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
    .send({ name: `Inquiry ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
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

  it('does not notify the organizer merely by opening an enquiry thread; notifies once a message is sent', async () => {
    const organizer = await registerAndLogin('notify-org');
    const tourist = await registerAndLogin('notify-tourist');
    const tripId = await createTrip(organizer.token, `Notify Trip ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    expect(opened.status).toBe(201);
    const chatRoomId = opened.body.data.chatRoomId;

    // Merely opening the inquiry thread without sending a message should NOT notify the organizer.
    const notificationsBefore = await prisma.notification.findMany({
      where: { userId: organizer.userId, tripId },
    });
    expect(notificationsBefore).toHaveLength(0);

    // Once a message is sent, the organizer is notified.
    await prisma.message.create({
      data: { chatRoomId, senderId: tourist.userId, content: 'Is there still room?' },
    });
    await notifyTripEnquiry({
      tripId,
      tripName: `Notify Trip ${runId}`,
      organizerId: organizer.userId,
      chatRoomId,
      travellerName: 'Inquiry notify-tourist',
      preview: 'Is there still room?',
    });

    const notificationsAfter = await prisma.notification.findMany({
      where: { userId: organizer.userId, tripId },
    });
    expect(notificationsAfter).toHaveLength(1);
    expect(notificationsAfter[0]!.category).toBe('TRIP_ENQUIRY');
    expect(notificationsAfter[0]!.chatRoomId).toBe(chatRoomId);
    expect(notificationsAfter[0]!.content).toContain('Inquiry notify-tourist');

    // The traveller who asked is not notified about their own question.
    expect(await prisma.notification.count({ where: { userId: tourist.userId, tripId } })).toBe(0);
  }, 90_000);

  it('shows an enquiry in the inbox as a direct message with no invented preview', async () => {
    const organizer = await registerAndLogin('inbox-org');
    const tourist = await registerAndLogin('inbox-tourist');
    const tripId = await createTrip(organizer.token, `Inbox Shape ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    for (const side of [organizer, tourist]) {
      const inbox = await request(app).get('/api/v1/chats').set('Authorization', `Bearer ${side.token}`);
      expect(inbox.status).toBe(200);
      const room = inbox.body.data.find((r: { id: string }) => r.id === chatRoomId);
      expect(room).toBeTruthy();

      // One traveller and one organizer is a direct message, from both
      // ends — not a group, and not a guide booking thread, which is
      // where every non-group room used to be filed.
      expect(room.type).toBe('DM');
      expect(room.badge).toBe('Direct');

      // Nobody has said anything yet, so there is no last message to show.
      // This used to read "System: Welcome to the group chat! Start
      // planning together." — a message no one sent, about a group that
      // does not exist.
      expect(room.latestMessage).toBe('');
      expect(room.latestMessage).not.toContain('group chat');
      // Still attributed to the trip it is about, so the inbox can label it.
      expect(room.inquiryTripId).toBe(tripId);
    }
  }, 90_000);

  it('drops the enquiry alert once the organizer has read that thread, however it was opened', async () => {
    const organizer = await registerAndLogin('read-org');
    const tourist = await registerAndLogin('read-tourist');
    const tripId = await createTrip(organizer.token, `Read Enquiry ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    await prisma.message.create({
      data: { chatRoomId, senderId: tourist.userId, content: 'Any seats left?' },
    });
    await notifyTripEnquiry({
      tripId,
      tripName: `Read Enquiry ${runId}`,
      organizerId: organizer.userId,
      chatRoomId,
      travellerName: 'Inquiry read-tourist',
      preview: 'Any seats left?',
    });
    expect(
      await prisma.notification.count({ where: { userId: organizer.userId, category: 'TRIP_ENQUIRY', chatRoomId } })
    ).toBe(1);

    // The organizer opens the thread themselves, straight from Chats &
    // Approvals — no notification tapped. Every entry point marks the room
    // read, which is what makes this the one reliable signal to hang the
    // dismissal on.
    const read = await request(app)
      .post(`/api/v1/chats/${chatRoomId}/read`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(read.status).toBe(200);

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.filter((n: { chatRoomId: string | null }) => n.chatRoomId === chatRoomId)).toHaveLength(0);

    // ...and the header dot / app badge agree with the list, rather than
    // staying lit over a row the page no longer shows.
    const count = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(count.body.data.count).toBe(0);
  }, 90_000);

  it('does not resurrect the alert when the notify write loses the race with the read', async () => {
    const organizer = await registerAndLogin('race-org');
    const tourist = await registerAndLogin('race-tourist');
    const tripId = await createTrip(organizer.token, `Race Enquiry ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    await prisma.message.create({
      data: { chatRoomId, senderId: tourist.userId, content: 'Still open?' },
    });

    // The organizer reads it with the chat already open on screen, before
    // the socket handler's fire-and-forget notify call gets its turn.
    await request(app)
      .post(`/api/v1/chats/${chatRoomId}/read`)
      .set('Authorization', `Bearer ${organizer.token}`);

    await notifyTripEnquiry({
      tripId,
      tripName: `Race Enquiry ${runId}`,
      organizerId: organizer.userId,
      chatRoomId,
      travellerName: 'Inquiry race-tourist',
      preview: 'Still open?',
    });

    // Nothing to nudge them about: they are already looking at it. This is
    // the row that used to survive every dismissal — it was written after
    // the read, so only re-opening the thread could ever clear it.
    expect(
      await prisma.notification.count({ where: { userId: organizer.userId, category: 'TRIP_ENQUIRY', chatRoomId } })
    ).toBe(0);

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(list.body.data.filter((n: { chatRoomId: string | null }) => n.chatRoomId === chatRoomId)).toHaveLength(0);
  }, 90_000);

  it('still nudges the organizer about a message they have not read', async () => {
    const organizer = await registerAndLogin('unread-org');
    const tourist = await registerAndLogin('unread-tourist');
    const tripId = await createTrip(organizer.token, `Unread Enquiry ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    // Read the thread first, then a genuinely new question arrives.
    await request(app)
      .post(`/api/v1/chats/${chatRoomId}/read`)
      .set('Authorization', `Bearer ${organizer.token}`);
    await prisma.message.create({
      data: { chatRoomId, senderId: tourist.userId, content: 'One more thing —' },
    });
    await notifyTripEnquiry({
      tripId,
      tripName: `Unread Enquiry ${runId}`,
      organizerId: organizer.userId,
      chatRoomId,
      travellerName: 'Inquiry unread-tourist',
      preview: 'One more thing —',
    });

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(list.body.data.filter((n: { chatRoomId: string | null }) => n.chatRoomId === chatRoomId)).toHaveLength(1);
  }, 90_000);

  it('marks the organizer side of the thread so it can be kept out of their chat inbox', async () => {
    const organizer = await registerAndLogin('flag-org');
    const tourist = await registerAndLogin('flag-tourist');
    const tripId = await createTrip(organizer.token, `Flag Enquiry ${runId}`);

    const opened = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${tourist.token}`)
      .send({ tripId });
    const chatRoomId = opened.body.data.chatRoomId;

    await prisma.message.create({
      data: { chatRoomId, senderId: tourist.userId, content: 'Is the trek beginner friendly?' },
    });

    const organizerInbox = await request(app)
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${organizer.token}`);
    const organizerRoom = organizerInbox.body.data.find((r: { id: string }) => r.id === chatRoomId);
    expect(organizerRoom).toBeTruthy();
    // The organizer answers this in the portal's Chats & Approvals tab, so
    // their chat inbox must be able to tell this room apart and drop it.
    expect(organizerRoom.isMyOrganizerInquiry).toBe(true);
    expect(organizerRoom.inquiryTripId).toBe(tripId);

    const touristInbox = await request(app)
      .get('/api/v1/chats')
      .set('Authorization', `Bearer ${tourist.token}`);
    const touristRoom = touristInbox.body.data.find((r: { id: string }) => r.id === chatRoomId);
    // For the traveller who asked, the very same thread is just a chat.
    expect(touristRoom.isMyOrganizerInquiry).toBe(false);
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

    // JOIN_REQUEST was missing from the NotificationCategory enum, so this
    // write threw on every single join request and the organizer was never
    // told anyone had asked for a seat.
    const joinNotifs = await prisma.notification.findMany({
      where: { userId: organizer.userId, tripId, category: 'JOIN_REQUEST' },
    });
    expect(joinNotifs).toHaveLength(1);
    expect(joinNotifs[0]!.joinRequestId).toBeTruthy();
  }, 90_000);

  it('summarizes pending enquiries across every trip the organizer runs, for the home-screen badge', async () => {
    const organizer = await registerAndLogin('summary-organizer');
    const asker1 = await registerAndLogin('summary-asker1');
    const asker2 = await registerAndLogin('summary-asker2');
    const tripA = await createTrip(organizer.token, `Summary Trip A ${runId}`);
    const tripB = await createTrip(organizer.token, `Summary Trip B ${runId}`);

    // Starts clean before anyone has written anything.
    const before = await request(app)
      .get('/api/v1/trips/mine/enquiries-summary')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(before.status).toBe(200);
    expect(before.body.data.totalUnread).toBe(0);

    const openA = await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${asker1.token}`)
      .send({ tripId: tripA });
    await request(app)
      .post('/api/v1/chats/inquiry')
      .set('Authorization', `Bearer ${asker2.token}`)
      .send({ tripId: tripB });

    // Two unread messages on trip A's thread, none yet on trip B's.
    await prisma.message.create({
      data: { chatRoomId: openA.body.data.chatRoomId, senderId: asker1.userId, content: 'Still 2 seats?', mediaType: 'NONE' },
    });
    await prisma.message.create({
      data: { chatRoomId: openA.body.data.chatRoomId, senderId: asker1.userId, content: 'Also, is food included?', mediaType: 'NONE' },
    });

    const after = await request(app)
      .get('/api/v1/trips/mine/enquiries-summary')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(after.status).toBe(200);
    expect(after.body.data.totalUnread).toBe(2);
    expect(after.body.data.trips).toEqual([
      { tripId: tripA, tripName: `Summary Trip A ${runId}`, unreadCount: 2 },
    ]);

    // The organizer's own message in the thread does not count against them.
    const asOtherUser = await request(app)
      .get('/api/v1/trips/mine/enquiries-summary')
      .set('Authorization', `Bearer ${asker1.token}`);
    expect(asOtherUser.body.data.totalUnread).toBe(0);
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

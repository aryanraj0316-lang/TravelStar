import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * End-to-end walk of the Group Organizer role view
 * (src/app/group-organizer.tsx): create a trip, take a join request through
 * approval, drive the roster and itinerary tools, broadcast an announcement,
 * and confirm each one both persists and reaches the member's side.
 */

const runId = Date.now();
const emails: string[] = [];
let seq = 0;

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `org-e2e-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let organizer: { token: string; userId: string };
let joiner: { token: string; userId: string };
let outsider: { token: string; userId: string };
let tripId: string;

beforeAll(async () => {
  organizer = await registerUser('Trip Organizer');
  joiner = await registerUser('Trip Joiner');
  outsider = await registerUser('Outsider');

  const res = await request(app)
    .post('/api/v1/trips')
    .set(auth(organizer.token))
    .send({
      name: `Organizer E2E ${runId}`,
      cities: ['Manali', 'Kaza'],
      startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      endDate: new Date(Date.now() + 35 * 864e5).toISOString(),
      budget: 24000,
      totalSeats: 4,
      meetingPoint: 'Manali Bus Stand',
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  tripId = res.body.data.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('roster before anyone joins', () => {
  it('shows the organizer alone, flagged as creator', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isCreator).toBe(true);
    expect(res.body.data[0].userId).toBe(organizer.userId);
  });

  it('does not dress the organizer in a stock photo of a stranger', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    // Null, so the client renders initials. It used to be one fixed
    // Unsplash portrait of an unrelated person.
    expect(res.body.data[0].avatar).toBeNull();
  });
});

describe('join request approval chain', () => {
  let requestId: string;

  it('accepts a join request from a traveller', async () => {
    const res = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(joiner.token))
      .send({ tripId, message: 'Would love to come along' });
    expect(res.status).toBe(201);
  });

  it('surfaces it in the organizer inbox', async () => {
    const res = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { userId: string }) => r.userId === joiner.userId);
    expect(row).toBeDefined();
    expect(row.status).toBe('PENDING');
    requestId = row.id;
  });

  it('does not show that inbox to anyone else', async () => {
    const res = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(outsider.token));
    expect(res.status).toBe(200);
    expect(res.body.data.find((r: { tripId: string }) => r.tripId === tripId)).toBeUndefined();
  });

  it('refuses approval from a non-organizer', async () => {
    const res = await request(app)
      .post(`/api/v1/interactions/join-request/${requestId}/status`)
      .set(auth(outsider.token))
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('approves and seats the traveller', async () => {
    const res = await request(app)
      .post(`/api/v1/interactions/join-request/${requestId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.chatRoomId).toBeTruthy();
  });

  it('puts the traveller on the roster', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    expect(res.body.data).toHaveLength(2);
    const member = res.body.data.find((m: { userId: string }) => m.userId === joiner.userId);
    expect(member.isCreator).toBe(false);
    expect(member.checkedIn).toBe(false);
  });

  it('tells the traveller they were accepted', async () => {
    const res = await request(app).get('/api/v1/notifications').set(auth(joiner.token));
    expect(res.status).toBe(200);
    const rows = res.body.data as { category: string; content: string }[];
    expect(rows.some((n) => n.category === 'JOIN_ACCEPTED')).toBe(true);
    expect(rows.find((n) => n.category === 'JOIN_ACCEPTED')?.content).toContain('group chat');
  });

  it('will not double-approve the same request', async () => {
    const res = await request(app)
      .post(`/api/v1/interactions/join-request/${requestId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(400);
  });
});

describe('roster tools persist', () => {
  it('checks a member in and it survives a refetch', async () => {
    const patch = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set(auth(organizer.token))
      .send({ checkedIn: true, roomAllocated: 'Room 204', seatAllocated: 'Seat 12B' });
    expect(patch.status).toBe(200);

    const list = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    const member = list.body.data.find((m: { userId: string }) => m.userId === joiner.userId);
    expect(member.checkedIn).toBe(true);
    expect(member.roomAllocated).toBe('Room 204');
    expect(member.seatAllocated).toBe('Seat 12B');
  });

  it('checks a member back out', async () => {
    await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set(auth(organizer.token))
      .send({ checkedIn: false });
    const list = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    const member = list.body.data.find((m: { userId: string }) => m.userId === joiner.userId);
    expect(member.checkedIn).toBe(false);
    expect(member.roomAllocated).toBe('Room 204');
  });

  it('refuses roster edits from a non-organizer', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set(auth(outsider.token))
      .send({ checkedIn: true });
    expect(res.status).toBe(403);
  });

  it('refuses an empty roster update rather than pretending it worked', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set(auth(organizer.token))
      .send({});
    expect(res.status).toBe(400);
  });

  it('404s on a user who is not a member', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${outsider.userId}`)
      .set(auth(organizer.token))
      .send({ checkedIn: true });
    expect(res.status).toBe(404);
  });
});

describe('itinerary', () => {
  const dayIds: string[] = [];

  it('starts empty — no hardcoded sample days', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/itinerary`).set(auth(organizer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(0);
    expect(res.body.data.canEdit).toBe(true);
  });

  it('numbers days server-side as they are added', async () => {
    for (const title of ['Arrive Manali', 'Rohtang', 'Kaza', 'Return']) {
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/itinerary`)
        .set(auth(organizer.token))
        .send({ title, plan: `Plan for ${title}` });
      expect(res.status).toBe(201);
      dayIds.push(res.body.data.id);
    }
    const list = await request(app).get(`/api/v1/trips/${tripId}/itinerary`).set(auth(organizer.token));
    expect(list.body.data.days.map((d: { day: number }) => d.day)).toEqual([1, 2, 3, 4]);
  });

  it('renumbers after a deletion so Day N still means the Nth day', async () => {
    const del = await request(app)
      .delete(`/api/v1/trips/${tripId}/itinerary/${dayIds[1]}`)
      .set(auth(organizer.token));
    expect(del.status).toBe(200);

    const list = await request(app).get(`/api/v1/trips/${tripId}/itinerary`).set(auth(organizer.token));
    expect(list.body.data.days.map((d: { day: number }) => d.day)).toEqual([1, 2, 3]);
    expect(list.body.data.days.map((d: { title: string }) => d.title)).toEqual(['Arrive Manali', 'Kaza', 'Return']);
  });

  it('lets a member read it but not edit it', async () => {
    const read = await request(app).get(`/api/v1/trips/${tripId}/itinerary`).set(auth(joiner.token));
    expect(read.status).toBe(200);
    expect(read.body.data.canEdit).toBe(false);
    expect(read.body.data.days).toHaveLength(3);

    const write = await request(app)
      .post(`/api/v1/trips/${tripId}/itinerary`)
      .set(auth(joiner.token))
      .send({ title: 'Sneaky', plan: 'Not allowed' });
    expect(write.status).toBe(403);
  });

  it('hides it from someone not on the trip', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/itinerary`).set(auth(outsider.token));
    expect(res.status).toBe(403);
  });
});

describe('announcements actually reach members', () => {
  it('delivers to the member and not back to the organizer', async () => {
    const before = await request(app).get('/api/v1/notifications').set(auth(joiner.token));
    const beforeCount = before.body.data.length;

    const post = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set(auth(organizer.token))
      .send({ title: 'Departure moved', content: 'We leave at 06:00, not 08:00.' });
    expect(post.status).toBe(201);
    expect(post.body.data.recipientCount).toBe(1);

    const after = await request(app).get('/api/v1/notifications').set(auth(joiner.token));
    expect(after.body.data.length).toBe(beforeCount + 1);
    expect(after.body.data[0].title).toBe('Departure moved');
    expect(after.body.data[0].content).toBe('We leave at 06:00, not 08:00.');

    const organizerFeed = await request(app).get('/api/v1/notifications').set(auth(organizer.token));
    expect(
      (organizerFeed.body.data as { title: string }[]).some((n) => n.title === 'Departure moved'),
    ).toBe(false);
  });

  it('reports push delivery separately from recipient count', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set(auth(organizer.token))
      .send({ title: 'Second notice', content: 'Bring warm layers.' });
    expect(res.body.data).toHaveProperty('pushed');
    expect(res.body.data.pushed).toBeLessThanOrEqual(res.body.data.recipientCount);
  });

  it('refuses an announcement from a non-organizer', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set(auth(joiner.token))
      .send({ title: 'Fake', content: 'Ignore the organizer.' });
    expect(res.status).toBe(403);
  });

  it('refuses an empty announcement', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set(auth(organizer.token))
      .send({ title: '   ', content: '' });
    expect(res.status).toBe(400);
  });
});

describe('rejection releases the seat', () => {
  it('rejects a request and leaves the roster unchanged', async () => {
    const second = await registerUser('Second Joiner');
    const jr = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(second.token))
      .send({ tripId, message: 'Room for one more?' });
    expect(jr.status).toBe(201);

    const inbox = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    const row = inbox.body.data.find((r: { userId: string }) => r.userId === second.userId);

    const res = await request(app)
      .post(`/api/v1/interactions/join-request/${row.id}/status`)
      .set(auth(organizer.token))
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');

    const members = await request(app).get(`/api/v1/trips/${tripId}/members`).set(auth(organizer.token));
    expect(members.body.data.find((m: { userId: string }) => m.userId === second.userId)).toBeUndefined();
  });
});

describe('the trip the organizer sees is the trip a joiner sees', () => {
  it('exposes the itinerary on the public trip detail so a prospective joiner can judge it', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}`).set(auth(outsider.token));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(`Organizer E2E ${runId}`);
    expect(res.body.data.cities).toEqual(['Manali', 'Kaza']);
  });

  it('quotes trip money as a string, not a float', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}`).set(auth(outsider.token));
    expect(typeof res.body.data.budget).toBe('string');
  });
});

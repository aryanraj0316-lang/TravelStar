import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

const runId = Date.now();
const userIds: string[] = [];
const tripIds: string[] = [];
let owner: { id: string; token: string };
let viewer: { id: string; token: string };

async function account(label: string) {
  const response = await request(app).post('/api/v1/auth/register').send({
    termsAccepted: true, name: `Before ${label}`, email: `feedback-${label}-${runId}@travelstar.test`,
    phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery',
  });
  expect(response.status).toBe(201);
  const id = response.body.data.user.id as string;
  userIds.push(id);
  return { id, token: response.body.data.token as string };
}

async function trip() {
  const row = await prisma.trip.create({ data: {
    creatorId: owner.id, name: `Feedback fixture ${runId}`, description: 'Isolated validation fixture',
    cities: ['Goa'], startDate: new Date('2027-01-01'), endDate: new Date('2027-01-02'),
    durationDays: 2, budget: 0, availableSeats: 4, totalSeats: 4, meetingPoint: 'Goa', languages: ['English'],
  } });
  tripIds.push(row.id);
  return row;
}

beforeAll(async () => {
  owner = await account('owner');
  viewer = await account('viewer');
});
afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

it('renames existing trip, chat, story, viewer and review identities without changing their ownership', async () => {
  const fixture = await trip();
  const room = await prisma.chatRoom.create({ data: {
    isGroup: true, tripId: fixture.id, name: fixture.name,
    members: { create: [{ userId: owner.id }, { userId: viewer.id }] },
  } });
  const message = await prisma.message.create({ data: { chatRoomId: room.id, senderId: owner.id, content: 'Existing message' } });
  const storyResponse = await request(app).post('/api/v1/stories').set('Authorization', `Bearer ${owner.token}`)
    .send({ title: 'Existing story', content: 'Text-only story', location: 'Goa' });
  expect(storyResponse.status).toBe(201);
  const storyId = storyResponse.body.data.id as string;
  expect((await request(app).post(`/api/v1/stories/${storyId}/view`).set('Authorization', `Bearer ${viewer.token}`)).status).toBe(200);
  const guide = await prisma.guideProfile.create({ data: {
    userId: owner.id, licenseNumber: `feedback-${runId}`, experienceYears: 1, expertisePlaces: ['Goa'],
    languagesSpoken: ['English'], hourlyRate: 0, dailyRate: 0, availability: {},
  } });
  await prisma.review.create({ data: { guideProfileId: guide.id, reviewerId: viewer.id, tripId: fixture.id,
    reviewerName: 'Before viewer', rating: 4, comment: 'Existing review' } });

  for (const [user, name] of [[owner, 'After Owner'], [viewer, 'After Viewer']] as const) {
    const saved = await request(app).put('/api/v1/auth/profile').set('Authorization', `Bearer ${user.token}`).send({ name });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ id: user.id, name });
  }
  const headers = { Authorization: `Bearer ${owner.token}` };
  for (const path of ['/api/v1/feed', '/api/v1/stories']) {
    const response = await request(app).get(path).set(headers);
    expect(response.status).toBe(200);
    expect(response.body.data.find((row: { id: string }) => row.id === storyId))
      .toMatchObject({ userId: owner.id, authorName: 'After Owner' });
  }
  const detail = await request(app).get(`/api/v1/trips/${fixture.id}`).set(headers);
  expect(detail.body.data.creator).toContain('After Owner');
  expect(detail.body.data.creatorId).toBe(owner.id);
  const history = await request(app).get(`/api/v1/chats/${room.id}/messages`).set(headers);
  expect(history.body.data.find((row: { id: string }) => row.id === message.id))
    .toMatchObject({ senderId: owner.id, senderName: 'After Owner', content: 'Existing message' });
  const roomDetail = await request(app).get(`/api/v1/chats/${room.id}`).set(headers);
  expect(roomDetail.body.data.members.find((row: { id: string }) => row.id === viewer.id).name).toBe('After Viewer');
  const interactions = await request(app).get(`/api/v1/stories/${storyId}/interactions`).set(headers);
  expect(interactions.body.data.viewers[0]).toMatchObject({ userId: viewer.id, name: 'After Viewer' });
  const reviews = await request(app).get(`/api/v1/guides/${guide.id}/reviews`).set(headers);
  expect(reviews.body.data[0].reviewerName).toBe('After Viewer');
});

it('expires old stories without affecting recent stories or creating views for expired content', async () => {
  const old = await prisma.travelStory.create({ data: {
    userId: owner.id, authorName: 'After Owner', title: 'Expired', content: 'Old fixture', location: 'Goa',
    createdAt: new Date(Date.now() - 86_400_001),
  } });
  const headers = { Authorization: `Bearer ${viewer.token}` };
  for (const path of ['/api/v1/feed', '/api/v1/stories']) {
    const response = await request(app).get(path).set(headers);
    expect(response.status).toBe(200);
    expect(response.body.data.some((row: { id: string }) => row.id === old.id)).toBe(false);
    expect(response.body.data.length).toBeGreaterThan(0);
  }
  expect((await request(app).post(`/api/v1/stories/${old.id}/view`).set(headers)).status).toBe(404);
  expect((await request(app).post(`/api/v1/stories/${old.id}/like`).set(headers)).status).toBe(404);
  expect((await request(app).get(`/api/v1/stories/${old.id}/interactions`).set(headers)).status).toBe(404);
  expect(await prisma.storyView.count({ where: { storyId: old.id } })).toBe(0);
});

it('deletes only the owner’s empty trip and preserves the existing account and session', async () => {
  const fixture = await trip();
  expect((await request(app).delete(`/api/v1/trips/${fixture.id}`).set('Authorization', `Bearer ${viewer.token}`)).status).toBe(403);
  const headers = { Authorization: `Bearer ${owner.token}` };
  expect((await request(app).delete(`/api/v1/trips/${fixture.id}`).set(headers)).body.data).toEqual({ deleted: true });
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: fixture.id } })).status).toBe('CANCELLED');
  for (const path of ['/api/v1/trips', '/api/v1/trips/mine']) {
    const response = await request(app).get(path).set(headers);
    expect(response.status).toBe(200);
    expect(response.body.data.some((row: { id: string }) => row.id === fixture.id)).toBe(false);
  }
  expect((await request(app).get('/api/v1/auth/profile').set(headers)).body.data).toMatchObject({ id: owner.id, name: 'After Owner' });
  expect((await request(app).get(`/api/v1/trips/${fixture.id}`).set(headers)).status).toBe(404);
  expect((await request(app).post('/api/v1/chats/inquiry').set('Authorization', `Bearer ${viewer.token}`).send({ tripId: fixture.id })).status).toBe(404);
  expect((await join(fixture.id)).status).toBe(404);
  expect(await prisma.joinRequest.count({ where: { tripId: fixture.id } })).toBe(0);
});

function join(tripId: string) {
  return request(app).post('/api/v1/interactions/join-request').set('Authorization', `Bearer ${viewer.token}`).send({
    tripId, acceptedTerms: true, travellerDetails: [{ fullName: 'Fixture Traveller', age: 24, gender: 'Other',
      phone: '+919876543210', emergencyContactName: 'Fixture Contact', emergencyContactPhone: '+919876543211',
      idType: 'PASSPORT', idNumber: 'TEST1234' }],
  });
}

it('cannot leave a deleted trip with a newly created request when deletion and joining race', async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const fixture = await trip();
    const [deletion, booking] = await Promise.all([
      request(app).delete(`/api/v1/trips/${fixture.id}`).set('Authorization', `Bearer ${owner.token}`),
      join(fixture.id),
    ]);
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: fixture.id } });
    if (row.status === 'CANCELLED') {
      expect(deletion.status).toBe(200);
      expect(booking.status).toBe(404);
      expect(await prisma.joinRequest.count({ where: { tripId: fixture.id } })).toBe(0);
    } else {
      expect(deletion.status).toBe(409);
      expect(booking.status).toBe(201);
    }
  }
});

it('preserves trips that already have an enquiry thread', async () => {
  const fixture = await trip();
  expect((await request(app).post('/api/v1/chats/inquiry').set('Authorization', `Bearer ${viewer.token}`).send({ tripId: fixture.id })).status).toBe(201);
  expect((await request(app).delete(`/api/v1/trips/${fixture.id}`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(409);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: fixture.id } })).status).toBe('ACTIVE');
});

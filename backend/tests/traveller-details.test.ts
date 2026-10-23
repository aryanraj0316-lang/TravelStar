import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';
import { TEST_ORGANIZER_AGREEMENT } from './organizer-agreement-fixture';
import { travellers } from './traveller-details-fixture';

/**
 * The traveller details form: required with every booking (one entry per
 * seat), required before any payment, and sent to the organizer with the
 * payment notification and in Approvals once paid.
 */

const runId = Date.now();
const emails: string[] = [];
let seq = 0;

async function register(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `traveller-details-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let organizer: { token: string; userId: string };
let tripId: string;

beforeAll(async () => {
  organizer = await register('Details Organizer');
  const trip = await request(app)
    .post('/api/v1/trips')
    .set(auth(organizer.token))
    .send({
      name: `Details Trip ${runId}`,
      cities: ['Manali', 'Kaza'],
      startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      endDate: new Date(Date.now() + 35 * 864e5).toISOString(),
      budget: 8000,
      totalSeats: 8,
      meetingPoint: 'Manali Bus Stand',
      privacy: 'PUBLIC',
      organizerAgreement: TEST_ORGANIZER_AGREEMENT,
    });
  expect(trip.status).toBe(201);
  tripId = trip.body.data.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('traveller details form', () => {
  it('refuses a booking without the form, or with one entry missing', async () => {
    const t = await register('No Form');
    const none = await request(app).post('/api/v1/interactions/join-request').set(auth(t.token)).send({ tripId, acceptedTerms: true });
    expect(none.status).toBe(400);

    const short = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId, familyMemberCount: 1, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(short.status).toBe(400);

    const [lead] = travellers(1);
    const noPhone = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId, acceptedTerms: true, travellerDetails: [{ ...lead, phone: undefined }] });
    expect(noPhone.status).toBe(400);
  });

  it('sends every traveller’s details to the organizer with the payment', async () => {
    const t = await register('Family Booker');
    const booked = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId, familyMemberCount: 1, acceptedTerms: true, travellerDetails: travellers(2) });
    expect(booked.status).toBe(201);
    const joinRequestId = booked.body.data.id as string;

    const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId });
    expect(paid.status).toBe(200);
    const token = paid.body.data.verificationToken as string;

    const notif = await prisma.notification.findFirst({
      where: { userId: organizer.userId, category: 'PAYMENT_SUCCESS', joinRequestId },
    });
    expect(notif?.content).toContain(token);
    expect(notif?.content).toContain('Test Traveller, 30 yrs, Male');
    expect(notif?.content).toContain('Passport P1234567');
    expect(notif?.content).toContain('Phone: 9876543210');
    expect(notif?.content).toContain('Emergency contact: Emergency Person · 9123456780');
    expect(notif?.content).toContain('Traveller 2: Companion 1, 31 yrs, Female');

    const inbox = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    const row = inbox.body.data.find((r: { id: string }) => r.id === joinRequestId);
    expect(row.detailsShared).toBe(true);
    expect(row.travellerDetails).toHaveLength(2);
    expect(row.travellerDetails[0].idNumber).toBe('P1234567');
  });

  it('refuses payment until an older booking has its form filled in', async () => {
    const t = await register('Old Booking');
    const jr = await prisma.joinRequest.create({
      data: { tripId, userId: t.userId, status: 'PAYMENT_PENDING', partySize: 1 },
    });

    const order = await request(app).get(`/api/v1/trip-payments/order/${jr.id}`).set(auth(t.token));
    expect(order.body.data.travellerDetailsSubmitted).toBe(false);

    const refused = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: jr.id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('TRAVELLER_DETAILS_REQUIRED');

    const saved = await request(app)
      .put(`/api/v1/interactions/join-request/${jr.id}/traveller-details`)
      .set(auth(t.token))
      .send({ travellerDetails: travellers(1) });
    expect(saved.status).toBe(200);

    const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: jr.id });
    expect(paid.status).toBe(200);

    // Locked once paid.
    const late = await request(app)
      .put(`/api/v1/interactions/join-request/${jr.id}/traveller-details`)
      .set(auth(t.token))
      .send({ travellerDetails: travellers(1) });
    expect(late.status).toBe(409);
  });
});

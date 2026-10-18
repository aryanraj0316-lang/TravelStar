import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';
import { TEST_ORGANIZER_AGREEMENT } from './organizer-agreement-fixture';
import { isValidDrivingLicence, isValidVehicleRegistration, maskIdNumber } from '../src/lib/organizer-terms';

/**
 * The organizer code of conduct: no trip is created or edited without it,
 * travellers can read it (licence masked, no phone), and a join request
 * carries the traveller's profile to the organizer — with their phone only
 * once they have paid.
 */

const runId = Date.now();
const emails: string[] = [];
let seq = 0;

async function register(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `org-agreement-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const tripBody = () => ({
  name: `Agreement Trip ${runId}`,
  cities: ['Manali', 'Kaza'],
  startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
  endDate: new Date(Date.now() + 35 * 864e5).toISOString(),
  budget: 12000,
  totalSeats: 4,
  meetingPoint: 'Manali Bus Stand',
  privacy: 'PUBLIC',
});

let organizer: { token: string; userId: string };
let traveller: { token: string; userId: string };
let tripId: string;

beforeAll(async () => {
  organizer = await register('Agreement Organizer');
  traveller = await register('Agreement Traveller');
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('licence and vehicle number checks', () => {
  it('accepts real formats and rejects junk', () => {
    expect(isValidDrivingLicence('MH12 20110012345')).toBe(true);
    expect(isValidDrivingLicence('dl-0420110012345')).toBe(true);
    expect(isValidDrivingLicence('12345')).toBe(false);
    expect(isValidVehicleRegistration('MH12 AB 1234')).toBe(true);
    expect(isValidVehicleRegistration('22BH1234AA')).toBe(true);
    expect(isValidVehicleRegistration('HELLO')).toBe(false);
    expect(maskIdNumber('MH1220110012345')).toBe('MH12 •••• 2345');
  });
});

describe('creating a trip', () => {
  it('refuses a trip with no agreement', async () => {
    const res = await request(app).post('/api/v1/trips').set(auth(organizer.token)).send(tripBody());
    expect(res.status).toBe(400);
  });

  it('refuses a driving organizer without a licence number', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set(auth(organizer.token))
      .send({ ...tripBody(), organizerAgreement: { ...TEST_ORGANIZER_AGREEMENT, organizerDrives: true } });
    expect(res.status).toBe(400);
  });

  it('creates the trip with the agreement recorded', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set(auth(organizer.token))
      .send({
        ...tripBody(),
        organizerAgreement: {
          ...TEST_ORGANIZER_AGREEMENT,
          organizerDrives: true,
          drivingLicenceNumber: 'MH12 20110012345',
          vehicleRegistrationNumber: 'MH12 AB 1234',
        },
      });
    expect(res.status).toBe(201);
    tripId = res.body.data.id;
    const row = await prisma.tripOrganizerAgreement.findUnique({ where: { tripId } });
    expect(row?.organizerDrives).toBe(true);
    expect(row?.drivingLicenceNumber).toBe('MH1220110012345');
    expect(Array.isArray(row?.termsSnapshot)).toBe(true);
  });
});

describe('reading the agreement', () => {
  it('shows a signed-out visitor the agreement with the licence masked and no phone', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/organizer-agreement`);
    expect(res.status).toBe(200);
    expect(res.body.data.viewerRole).toBe('VISITOR');
    expect(res.body.data.agreement.drivingLicenceNumber).toBe('MH12 •••• 2345');
    expect(res.body.data.organizer.phoneNumber).toBeNull();
    expect(res.body.data.agreement.clauses.length).toBeGreaterThan(5);
  });

  it('shows the organizer their own full details', async () => {
    const res = await request(app).get(`/api/v1/trips/${tripId}/organizer-agreement`).set(auth(organizer.token));
    expect(res.body.data.viewerRole).toBe('ORGANIZER');
    expect(res.body.data.agreement.drivingLicenceNumber).toBe('MH1220110012345');
    expect(res.body.data.organizer.phoneNumber).toBeTruthy();
  });
});

describe('editing a trip', () => {
  it('requires re-accepting the agreement', async () => {
    const res = await request(app).patch(`/api/v1/trips/${tripId}`).set(auth(organizer.token)).send({ name: 'Renamed' });
    expect(res.status).toBe(400);
  });

  it('saves the edit with the re-accepted agreement', async () => {
    const before = await prisma.tripOrganizerAgreement.findUnique({ where: { tripId } });
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set(auth(organizer.token))
      .send({ name: 'Renamed', organizerAgreement: TEST_ORGANIZER_AGREEMENT });
    expect(res.status).toBe(200);
    const after = await prisma.tripOrganizerAgreement.findUnique({ where: { tripId } });
    expect(after?.organizerDrives).toBe(false);
    expect(after?.drivingLicenceNumber).toBeNull();
    expect(after!.acceptedAt.getTime()).toBeGreaterThanOrEqual(before!.acceptedAt.getTime());
  });
});

describe('traveller details on a request', () => {
  it('sends the profile but not the phone before payment', async () => {
    const join = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveller.token))
      .send({ tripId, acceptedTerms: true });
    expect(join.status).toBe(201);

    const res = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    const row = res.body.data.find((r: { userId: string }) => r.userId === traveller.userId);
    expect(row.applicant).toBeDefined();
    expect(row.contact).toBeNull();
  });
});

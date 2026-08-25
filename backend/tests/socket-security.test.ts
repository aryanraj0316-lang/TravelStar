import http from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { createSocketServer } from '../src/socket-server';

/**
 * Integration tests for the Phase 3 socket-layer fixes in
 * docs/REMEDIATION.md: handshake authentication, room-membership
 * authorization, sender-identity spoofing, and SOS audience scoping.
 *
 * Runs a real Socket.io server on an ephemeral port against the same
 * DATABASE_URL as the rest of the suite — see auth-security.test.ts for why
 * (no Testcontainers available in this environment). All fixtures created
 * here are deleted in afterAll.
 */

const runId = Date.now();
let httpServer: http.Server;
let port: number;
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdChatRoomIds: string[] = [];

function uniqueEmail(label: string): string {
  const email = `test-socket-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  return email;
}

async function registerUser(label: string) {
  const email = uniqueEmail(label);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, password: 'correcthorsebattery' });
  return { id: res.body.user.id as string, token: res.body.token as string };
}

function connectClient(token: string | undefined): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Resolves if the event does NOT fire within the window — used to assert scoping. */
function assertEventNeverFires(socket: ClientSocket, event: string, windowMs = 1200): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, windowMs);
    socket.once(event, () => {
      clearTimeout(timer);
      reject(new Error(`"${event}" fired but should not have`));
    });
  });
}

beforeAll(async () => {
  httpServer = http.createServer(app);
  createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  httpServer.close();
  await prisma.message.deleteMany({ where: { chatRoomId: { in: createdChatRoomIds } } });
  await prisma.chatRoomMember.deleteMany({ where: { chatRoomId: { in: createdChatRoomIds } } });
  await prisma.chatRoom.deleteMany({ where: { id: { in: createdChatRoomIds } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: createdTripIds } } });
  await prisma.sOSAlert.deleteMany({ where: { user: { email: { in: createdEmails } } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Socket handshake authentication (docs/REMEDIATION.md §3.1)', () => {
  it('rejects a connection with no token', async () => {
    await expect(connectClient(undefined)).rejects.toBeTruthy();
  });

  it('rejects a connection with a garbage token', async () => {
    await expect(connectClient('not-a-real-token')).rejects.toBeTruthy();
  });

  it('accepts a connection with a valid access token', async () => {
    const user = await registerUser('handshake-ok');
    const socket = await connectClient(user.token);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});

describe('Room join authorization (docs/REMEDIATION.md §3.2)', () => {
  let member: { id: string; token: string };
  let outsider: { id: string; token: string };
  let chatRoomId: string;

  beforeAll(async () => {
    member = await registerUser('room-member');
    outsider = await registerUser('room-outsider');

    const room = await prisma.chatRoom.create({ data: { isGroup: true, name: 'Test Room' } });
    chatRoomId = room.id;
    createdChatRoomIds.push(chatRoomId);
    await prisma.chatRoomMember.create({ data: { chatRoomId, userId: member.id } });

    await prisma.message.create({
      data: { chatRoomId, senderId: member.id, content: 'pre-existing history', mediaType: 'NONE' },
    });
  });

  it('refuses to let a non-member join the room', async () => {
    const socket = await connectClient(outsider.token);
    socket.emit('joinRoom', chatRoomId);
    const err = await waitForEvent<{ roomId: string }>(socket, 'roomJoinError');
    expect(err.roomId).toBe(chatRoomId);
    socket.disconnect();
  });

  // The socket layer no longer serves history at all (§3.5 — the client
  // loads it via REST), so these REST routes are the actual mechanism by
  // which chat history is read. A non-member being blocked on the socket
  // path but not here would mean the fix above is security theater.
  it('refuses to let a non-member read the room over REST', async () => {
    const res = await request(app)
      .get(`/api/v1/chats/${chatRoomId}`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  it('refuses to let a non-member read message history over REST', async () => {
    const res = await request(app)
      .get(`/api/v1/chats/${chatRoomId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  it('lets an actual member read the room and its history over REST', async () => {
    const roomRes = await request(app)
      .get(`/api/v1/chats/${chatRoomId}`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(roomRes.status).toBe(200);

    const messagesRes = await request(app)
      .get(`/api/v1/chats/${chatRoomId}/messages`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.data.some((m: { content: string }) => m.content === 'pre-existing history')).toBe(true);
  });

  it('a non-member cannot send a message into the room either', async () => {
    const socket = await connectClient(outsider.token);
    socket.emit('sendMessage', { chatRoomId, content: 'should be rejected' });
    const err = await waitForEvent<{ message: string }>(socket, 'sendMessageError');
    expect(err.message).toMatch(/not a member/i);
    socket.disconnect();
  });

  it('lets an actual member join and send a message, with the server deriving the sender identity', async () => {
    const socket = await connectClient(member.token);

    const joined = await new Promise<boolean>((resolve) => {
      socket.emit('joinRoom', chatRoomId, resolve);
    });
    expect(joined).toBe(true);

    const receivedPromise = waitForEvent<{ message: { senderId: string; senderName: string } }>(
      socket,
      'messageReceived'
    );
    // Payload tries to spoof a different sender — must be ignored.
    socket.emit('sendMessage', {
      chatRoomId,
      content: 'hello from the real member',
      senderId: 'not-my-id',
      senderName: 'Someone Else',
    });

    const { message } = await receivedPromise;
    expect(message.senderId).toBe(member.id);
    expect(message.senderName).toBe('room-member');
    socket.disconnect();
  });
});

describe('SOS audience scoping (docs/REMEDIATION.md §3.4)', () => {
  let victim: { id: string; token: string };
  let tripMate: { id: string; token: string };
  let stranger: { id: string; token: string };
  let tripId: string;

  beforeAll(async () => {
    victim = await registerUser('sos-victim');
    tripMate = await registerUser('sos-tripmate');
    stranger = await registerUser('sos-stranger');

    const trip = await prisma.trip.create({
      data: {
        creatorId: victim.id,
        name: 'Socket Test Trip',
        description: 'fixture',
        cities: ['Delhi'],
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        durationDays: 7,
        budget: 5000,
        availableSeats: 5,
        totalSeats: 10,
        meetingPoint: 'Test Point',
      },
    });
    tripId = trip.id;
    createdTripIds.push(tripId);

    await prisma.tripMember.createMany({
      data: [
        { tripId, userId: victim.id, role: 'ORGANIZER' },
        { tripId, userId: tripMate.id, role: 'MEMBER' },
      ],
    });
  });

  it('notifies a fellow trip member but not an unrelated stranger', async () => {
    const victimSocket = await connectClient(victim.token);
    const tripMateSocket = await connectClient(tripMate.token);
    const strangerSocket = await connectClient(stranger.token);

    const tripMateGetsIt = waitForEvent(tripMateSocket, 'sosReceived');
    const strangerNeverGetsIt = assertEventNeverFires(strangerSocket, 'sosReceived');

    victimSocket.emit('triggerSOS', { userName: 'Victim', latitude: 28.6, longitude: 77.2 });

    await expect(tripMateGetsIt).resolves.toBeTruthy();
    await expect(strangerNeverGetsIt).resolves.toBeUndefined();

    victimSocket.disconnect();
    tripMateSocket.disconnect();
    strangerSocket.disconnect();
  });

  it('refuses to let an unrelated user resolve the alert over the socket', async () => {
    const alert = await prisma.sOSAlert.create({
      data: { userId: victim.id, latitude: 28.6, longitude: 77.2 },
    });

    const strangerSocket = await connectClient(stranger.token);
    strangerSocket.emit('resolveSOS', { id: alert.id });
    const err = await waitForEvent<{ message: string }>(strangerSocket, 'resolveSOSError');
    expect(err.message).toMatch(/not authorised/i);

    const stillActive = await prisma.sOSAlert.findUnique({ where: { id: alert.id } });
    expect(stillActive?.status).toBe('ACTIVE');

    strangerSocket.disconnect();
  });
});

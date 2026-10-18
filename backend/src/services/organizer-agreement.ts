import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from './db';
import {
  ORGANIZER_TERMS,
  ORGANIZER_TERMS_VERSION,
  isValidDrivingLicence,
  isValidVehicleRegistration,
  maskIdNumber,
  normalizeIdNumber,
} from '../lib/organizer-terms';

// The organizer's signed agreement for a trip: required to publish a trip
// (POST /trips) and re-accepted on every edit (PATCH /trips/:id).

export const organizerAgreementInputSchema = z
  .object({
    accepted: z.literal(true),
    termsVersion: z.literal(ORGANIZER_TERMS_VERSION),
    organizerDrives: z.boolean(),
    drivingLicenceNumber: z.string().trim().max(32).optional(),
    vehicleRegistrationNumber: z.string().trim().max(20).optional(),
    language: z.string().trim().max(40).optional(),
  })
  .superRefine((a, ctx) => {
    if (!a.organizerDrives) return;
    if (!a.drivingLicenceNumber || !isValidDrivingLicence(a.drivingLicenceNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drivingLicenceNumber'],
        message: 'Enter a valid driving licence number, e.g. MH12 20110012345.',
      });
    }
    if (a.vehicleRegistrationNumber && !isValidVehicleRegistration(a.vehicleRegistrationNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicleRegistrationNumber'],
        message: 'Enter a valid vehicle number, e.g. MH12 AB 1234.',
      });
    }
  });

export type OrganizerAgreementInput = z.infer<typeof organizerAgreementInputSchema>;

type Db = Prisma.TransactionClient | typeof prisma;

/** Records (or, on an edit, re-records) the organizer's acceptance. */
export async function saveOrganizerAgreement(
  db: Db,
  tripId: string,
  organizerId: string,
  input: OrganizerAgreementInput,
): Promise<void> {
  const drives = input.organizerDrives;
  const data = {
    organizerId,
    termsVersion: ORGANIZER_TERMS_VERSION,
    termsSnapshot: ORGANIZER_TERMS as unknown as Prisma.InputJsonValue,
    acceptedLanguage: input.language ?? null,
    organizerDrives: drives,
    drivingLicenceNumber: drives && input.drivingLicenceNumber ? normalizeIdNumber(input.drivingLicenceNumber) : null,
    vehicleRegistrationNumber:
      drives && input.vehicleRegistrationNumber ? normalizeIdNumber(input.vehicleRegistrationNumber) : null,
    acceptedAt: new Date(),
  };
  await db.tripOrganizerAgreement.upsert({
    where: { tripId },
    create: { tripId, ...data },
    update: data,
  });
}

function displayName(profile: { firstName: string; lastName: string } | null, email: string | null): string {
  if (profile) {
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    if (name) return name;
  }
  return email ? email.split('@')[0]! : 'Organizer';
}

/**
 * The agreement and organizer profile as a given viewer may see them.
 * Everyone (even signed out — travellers read it before booking) sees the
 * organizer's public profile and the agreement with the licence masked. The
 * organizer's phone number goes only to confirmed members of the trip and the
 * organizer; the full licence and vehicle numbers only to the organizer.
 */
export async function getOrganizerAgreementView(tripId: string, viewerId: string | null) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      creatorId: true,
      creator: { include: { profile: true } },
      organizerAgreement: true,
    },
  });
  if (!trip) return null;

  const isOrganizer = !!viewerId && viewerId === trip.creatorId;
  const isMember =
    !!viewerId && !isOrganizer && !!(await prisma.tripMember.findFirst({ where: { tripId, userId: viewerId }, select: { id: true } }));

  const tripsHosted = await prisma.trip.count({ where: { creatorId: trip.creatorId } });
  const p = trip.creator.profile;
  const organizer = {
    id: trip.creatorId,
    name: displayName(p, trip.creator.email),
    avatarUrl: p?.avatarUrl ?? null,
    bio: p?.bio ?? null,
    age: p?.age ?? null,
    gender: p?.gender ?? null,
    city: p?.city ?? null,
    state: p?.state ?? null,
    languages: p?.languages ?? [],
    verifiedBadge: p?.verifiedBadge ?? false,
    rating: p?.rating ?? null,
    memberSince: trip.creator.createdAt,
    tripsHosted,
    phoneNumber: isOrganizer || isMember ? (trip.creator.phoneNumber ?? null) : null,
  };

  const a = trip.organizerAgreement;
  const agreement = a
    ? {
        termsVersion: a.termsVersion,
        // The English text as signed — the app shows the translated clauses
        // for the current version and falls back to this for older ones.
        clauses: a.termsSnapshot as unknown as { id: string; title: string; body: string }[],
        acceptedAt: a.acceptedAt,
        organizerDrives: a.organizerDrives,
        drivingLicenceNumber: isOrganizer ? a.drivingLicenceNumber : maskIdNumber(a.drivingLicenceNumber),
        vehicleRegistrationNumber: isOrganizer ? a.vehicleRegistrationNumber : maskIdNumber(a.vehicleRegistrationNumber),
      }
    : null;

  return { tripId, viewerRole: isOrganizer ? 'ORGANIZER' : isMember ? 'MEMBER' : 'VISITOR', organizer, agreement };
}

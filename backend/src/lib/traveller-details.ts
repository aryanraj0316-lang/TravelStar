// The traveller details form filled in before paying for a trip: one entry
// per seat (the person booking first, then everyone booked with them). This
// is what the organizer receives with the payment, in place of the booker's
// saved profile.
import { z } from 'zod';

export const ID_TYPES = ['AADHAAR', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID', 'PAN'] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;

export const ID_TYPE_LABELS: Record<(typeof ID_TYPES)[number], string> = {
  AADHAAR: 'Aadhaar',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
  VOTER_ID: 'Voter ID',
  PAN: 'PAN card',
};

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{6,18}[0-9]$/, 'Enter a valid phone number');

const travellerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(100),
  age: z.number().int().min(0).max(120),
  gender: z.enum(GENDERS),
  phone: phone.optional(),
  emergencyContactName: z.string().trim().min(2).max(100).optional(),
  emergencyContactPhone: phone.optional(),
  idType: z.enum(ID_TYPES),
  idNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{4,30}$/, 'Enter a valid ID number'),
});

export type TravellerDetails = z.infer<typeof travellerSchema>;

/**
 * Everyone needs a name, age, gender and ID. The person booking (the first
 * entry) also has to give a phone number and an emergency contact; for the
 * others those are optional.
 */
export const travellerDetailsSchema = z
  .array(travellerSchema)
  .min(1)
  .max(9)
  .superRefine((list, ctx) => {
    const lead = list[0];
    if (!lead) return;
    if (!lead.phone) ctx.addIssue({ code: 'custom', path: [0, 'phone'], message: 'Phone number is required' });
    if (!lead.emergencyContactName) {
      ctx.addIssue({ code: 'custom', path: [0, 'emergencyContactName'], message: 'Emergency contact name is required' });
    }
    if (!lead.emergencyContactPhone) {
      ctx.addIssue({ code: 'custom', path: [0, 'emergencyContactPhone'], message: 'Emergency contact number is required' });
    }
  });

/** Reads the stored JSON column back; anything malformed counts as missing. */
export function parseStoredTravellerDetails(value: unknown): TravellerDetails[] | null {
  if (value == null) return null;
  const parsed = travellerDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The details as plain lines, for the organizer's payment notification. */
export function formatTravellerDetails(list: TravellerDetails[]): string {
  return list
    .map((t, i) => {
      const lines = [
        `${list.length > 1 ? `Traveller ${i + 1}: ` : 'Traveller: '}${t.fullName}, ${t.age} yrs, ${t.gender}`,
        `ID: ${ID_TYPE_LABELS[t.idType]} ${t.idNumber}`,
      ];
      if (t.phone) lines.push(`Phone: ${t.phone}`);
      if (t.emergencyContactName || t.emergencyContactPhone) {
        lines.push(`Emergency contact: ${[t.emergencyContactName, t.emergencyContactPhone].filter(Boolean).join(' · ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

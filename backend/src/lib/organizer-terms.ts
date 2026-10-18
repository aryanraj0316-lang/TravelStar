// The organizer code of conduct every trip is published under. The app shows
// these clauses translated (src/locales/*.json → organizerTerms.clauses); this
// English text is the canonical wording, and is what gets stored on each
// trip's TripOrganizerAgreement.termsSnapshot as the signed record.
//
// Changing any clause means a new ORGANIZER_TERMS_VERSION, so every stored
// agreement keeps saying exactly what its organizer accepted. Keep the clause
// ids in step with src/lib/organizer-terms.ts in the app.

export const ORGANIZER_TERMS_VERSION = '2026-10-18';

export interface OrganizerTermsClause {
  id: string;
  title: string;
  body: string;
}

export const ORGANIZER_TERMS: readonly OrganizerTermsClause[] = [
  {
    id: 'sober',
    title: 'No alcohol, smoking or drugs',
    body:
      'I will not consume alcohol, tobacco, or any drug or intoxicating substance at any point during the trip, and will never drive or lead the group under their influence. I will not offer or supply them to travellers.',
  },
  {
    id: 'driving',
    title: 'Safe and licensed driving',
    body:
      'If I drive between destinations, I hold a valid driving licence for that vehicle class and carry it with me. I will obey traffic laws and speed limits, ensure everyone wears a seat belt, take a rest break at least every 3 hours, never use a phone while driving, and not drive more than 10 hours in a day.',
  },
  {
    id: 'vehicle',
    title: 'Roadworthy, legal vehicles',
    body:
      'Every vehicle used on the trip is registered, insured, carries a valid PUC certificate and any commercial or tourist permit the route requires, has working seat belts, and is never loaded beyond its seating capacity. Hired drivers must meet the same rules.',
  },
  {
    id: 'safety',
    title: 'Traveller safety comes first',
    body:
      'I will carry a stocked first-aid kit, know the nearest hospital and police station at each stop, keep the emergency number 112 and every traveller’s emergency contact at hand, respond immediately to any SOS alert in the app, and call off or change any activity that becomes unsafe.',
  },
  {
    id: 'respect',
    title: 'Zero tolerance for harassment',
    body:
      'I will treat every traveller with respect. I will not harass, intimidate, discriminate against, or touch anyone without consent, and will act at once on any complaint. I will respect privacy, including in rooming and changing arrangements, and will not photograph or record travellers without their permission.',
  },
  {
    id: 'honest',
    title: 'Honest listing and pricing',
    body:
      'The price, itinerary, dates, inclusions and exclusions in this listing are accurate. I will not add hidden charges or ask for more money once a booking is made, and will announce any change in the group chat as soon as I know of it.',
  },
  {
    id: 'stays',
    title: 'Stays and transport as promised',
    body:
      'I will book the accommodation and transport described in the listing. If something becomes unavailable, I will arrange an equal or better alternative at no extra cost and tell travellers before they arrive.',
  },
  {
    id: 'legal',
    title: 'Permits and local laws',
    body:
      'I will obtain every permit the route needs (such as inner line, forest or protected-area permits), follow all local laws and regulations, and will not take the group into any area or activity that is illegal or officially closed.',
  },
  {
    id: 'payments',
    title: 'Payments and refunds through the app',
    body:
      'I will collect trip payments only through this app and will never ask travellers to pay me outside it. Cancellations and refunds follow the app’s cancellation policy; if I cancel the trip, every traveller gets a full refund.',
  },
  {
    id: 'noone_left',
    title: 'No traveller left behind',
    body:
      'I will take a headcount before every departure and will never leave a traveller stranded. If a traveller has to leave the trip early for a medical or safety reason, I will help them get safely to the nearest town or transport.',
  },
  {
    id: 'weather',
    title: 'Weather and hazard alerts',
    body:
      'I will check weather and hazard alerts before each leg, follow official advisories, and postpone or reroute any part of the trip that is unsafe, telling the group in the chat.',
  },
  {
    id: 'privacy',
    title: 'Travellers’ personal information',
    body:
      'I will use travellers’ personal details, including phone numbers and emergency contacts, only to run this trip. I will not share, sell or publish them, and will not contact travellers for unrelated purposes.',
  },
  {
    id: 'environment',
    title: 'Respect for places and people',
    body:
      'I will respect local customs, communities and places of worship, leave no litter behind, and not disturb wildlife or protected sites.',
  },
  {
    id: 'truthful',
    title: 'True and accurate declarations',
    body:
      'Everything I have declared, including my identity, driving licence and vehicle details, is true. I understand I am personally responsible for any false declaration.',
  },
  {
    id: 'enforcement',
    title: 'Enforcement',
    body:
      'I understand that breaking any of these terms can lead to the trip being removed, refunds being issued to travellers, and my account being suspended, and that the platform may cooperate with the authorities when required.',
  },
];

/** Uppercase, with spaces and hyphens removed — the form stored and compared. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// Indian driving licence: state code (2 letters) + RTO code + year + serial,
// e.g. MH12 20110012345. Older and some state formats vary in length, so this
// checks the shape (state letters, then 8–14 letters/digits) rather than one
// exact layout.
const DRIVING_LICENCE_RE = /^[A-Z]{2}[0-9A-Z]{8,14}$/;

// Vehicle registration: MH12AB1234 / DL3CAF1234 style, or Bharat series 22BH1234AA.
const VEHICLE_REG_RE = /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

export function isValidDrivingLicence(value: string): boolean {
  return DRIVING_LICENCE_RE.test(normalizeIdNumber(value));
}

export function isValidVehicleRegistration(value: string): boolean {
  return VEHICLE_REG_RE.test(normalizeIdNumber(value));
}

/** "MH1220110012345" → "MH12 •••• 2345": enough to recognise, not to copy. */
export function maskIdNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = normalizeIdNumber(value);
  if (v.length <= 8) return `${v.slice(0, 2)} •••• ${v.slice(-2)}`;
  return `${v.slice(0, 4)} •••• ${v.slice(-4)}`;
}

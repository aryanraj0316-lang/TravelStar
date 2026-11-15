# Yatrenzo privacy policy audit — 6 November 2026

## Fix status after the audit

The three material findings below now have local implementation changes and
regression tests. They have not been deployed to the running service. See
[PRIVACY_FIX_ROLLOUT.md](PRIVACY_FIX_ROLLOUT.md) for the implementation, historical
file limitations, bucket/CDN revocation and migration sequence. The findings below
record the original audited behavior; they are not a description of the revised
local code. The policy artifacts have been regenerated for the corrected behavior
and must be published only after rollout.

## Outcome

Revised policy artifacts are in `legal-pages/privacy.html` and
`legal-pages/delete-account.html`. The app reads the same text from
`src/content/privacy-policy.json`. Run `node scripts/generate-legal-pages.cjs`
after changing that JSON. Client/server consent version markers were updated
to `2026-11-06`. These are local changes; an app/backend release and replacement
of the GitHub Pages files are separate deployment steps.

This is a source and public-endpoint audit, not a legal opinion, a certification
of Google Play compliance, or a live personal-data deletion test. No real user
account was created, altered or deleted. Existing unrelated working-tree changes
were preserved.

## Confirmed scope and deployment

- User confirmed Rakesh personally operates the app, and
  `1bharatgo@gmail.com` is handled by the person responsible for the app.
- Current Google Play publisher, as shown by the user's verified account, is
  Ankit Kumar Gupta / Eternity31. The revised policy distinguishes these roles.
- User confirmed Render is current and Fly.io is planned. Fly.io is not described
  as a currently active processor.
- Public Render `/health` returned HTTP 200, commit `7c508fd4`, at
  `2026-11-06T15:35:50Z`. The checked working-tree HEAD was `aa32da2`, with additional
  uncommitted changes. Local behavior must not be assumed identical to deployment.
- Public GitHub policy returned HTTP 200 and contained the earlier 10,726-character
  policy. This confirms accessibility, not that revised local text is deployed.
- Production EAS configuration points at the Render HTTPS API.
- No access to Render/Fly dashboards, deployed environment variables, database
  backup settings or storage lifecycle policies was established. Do not assert a
  database vendor, storage vendor/region, fixed backup expiry or production
  credential status from comments or local configuration.

## Data handling verified in source

| Category | Evidence | Policy treatment |
| --- | --- | --- |
| Registration | `backend/src/api/routes/auth.ts` register schema requires name, email, phone and password | Explicit collection, no claim of verified age |
| Passwords | `backend/src/services/password.ts` uses Argon2id | Removed old bcrypt claim |
| Sessions | `backend/src/services/session.ts` stores user-agent/IP and hashed refresh tokens | Disclosed technical/security information |
| Device storage | `src/services/secureStorage.ts`, `storage.ts`, query persistence | Distinguishes native secure tokens from ordinary cached data |
| Booking identity | `backend/src/lib/traveller-details.ts`, `trip-payments.ts` | Names ID types/numbers, emergency contacts, minors supplied by adults, organizer access |
| Driving details | `TripOrganizerAgreement` schema and organizer agreement service | Licence/vehicle numbers and trip/group visibility disclosed |
| Payouts | `payouts.ts`, `organizer-payouts.ts` | Full details transmitted to Razorpay; payout record masks PAN and stores account last four |
| Content | schema, stories/feed/chat routes | Posts/media/messages and identifiable story view/like records disclosed |
| Location | device-location helper, map/guides routes, socket server | Foreground requests, wider signed-in audience, last-known SOS fallback |
| SOS | safety routes, sos-audience service | Actual recipients and persistence; no promise of police notification or SMS to non-users |
| Permission categories | manifest, app.json, image-picker calls, push.ts | Camera/photos/location/notifications; microphone declared but no recording implementation found |
| Providers | payment/email/push/map/weather/update paths | Razorpay, Expo/platform push, Brevo when configured, OSM/routing, Google Directions when configured, OpenWeatherMap |
| Public webpage | generated HTML | No scripts, embeds, fonts, analytics or form; GitHub hosting and email link explained |

## Release gaps that policy text cannot fix

### 1. Account deletion does not remove all associated data

`auth.ts` closes booking flows, deletes organized trips and the user, relying on
database cascades. `TravelStory.userId`, `StoryView.userId` and `StoryLike.userId`
are plain strings without a User foreign key. They survive this cascade.
Story author names/avatar URLs remain in those records. Messages/notifications
addressed to another user can contain copied traveller information and outlive
the originator's account. The revised policy explicitly describes the manual
support route; that wording is not a replacement for comprehensive erasure.

`Booking`, `Transaction`, `CallLog` and other required relations without cascades
can block deletion depending on the actual data. No real-user deletion was tested.
Exercise these cases with disposable staging data and implement deletion or
anonymization for every relevant data class.

### 2. Uploaded files have no complete erasure lifecycle

`object-storage.ts` signs uploads and returns public URLs. No DeleteObject cleanup
was found in account/story deletion. `stories.ts` local direct-upload fallback
writes files; deleting a story deletes its database row, not the file.
Account deletion should enqueue and verify removal of all owned media, including
replaced/unattached uploads and provider copies under the operator's control.

Public object URLs also mean chat attachments do not have recipient-level file
access control. A policy must not call those attachments private or end-to-end
encrypted. Before release, prefer authenticated media delivery for private chats.

### 3. Guide live status does not consistently honor sharing controls

The map route checks `locationSharing`; the guide live-status GET route reads a
stored position without that same flag/freshness check. POST ownership is checked,
but the general sharing flag is not used to remove existing guide positions.
Do not promise the general toggle instantly removes all published guide locations.
Gate guide reads/writes consistently and provide a working stop/delete action.

### 4. Retention and backups are not operationally established

LiveLocation cleanup targets rows older than 24 hours on an hourly scheduler.
Socket presence uses five-minute TTL (lazy pruning for in-memory fallback).
SOS, chat, notifications, stories, uploaded media, payment and diagnostic records
do not share that automatic expiry. The previous claims of no persistent location
storage, five-year payment retention and universal 30-day erasure were unsupported.

Rakesh must establish actual retention periods, legal exceptions, backup rotation
and a tested support procedure, then update the public policy with those details.
The request mailbox's existence was user-confirmed; response times and execution
of requests were not tested. No invented response deadline was added.

### 5. Sensitive data and consent deserve release review

Booking ID numbers, including Aadhaar, are stored and sent to organizers. This is
separate from the removed profile-KYC feature. Review necessity, protection,
recipient access and legal basis before enabling this collection in production.
The policy cannot itself make the collection compliant.

Runtime OS permission prompts and consent logs exist, but they are not by themselves
proof of compliant prominent disclosure for unexpected sharing. Review the actual
screens before location upload, in particular wider map visibility and guide status.

The microphone permission remains although current voice recording/calling code
was not found. Remove unnecessary release permissions or implement and disclose
the intended feature accurately. No background location task was found.

Age is not independently enforced in the current register schema. The policy
describes an intended 18+ account audience, not verified adult-only access.

### 6. Export is partial and stale legal wording remains in Terms

The export route covers core categories, not every stored model (e.g. uploaded
files, all stories/interactions, and every payment/consent/session record).
Revised policy calls it a core-data export and allows supplementary requests.
`src/app/legal/terms.tsx` section 12 was updated to the same access/deletion
wording as the revised privacy policy, removing its conflicting 30-day promise.
The rest of the Terms were not subjected to a full legal audit.

## Verification performed

- Read registration, profile, traveller, organizer, payment/payout, chat/story,
  map/guide/SOS, notifications, consent, storage, session and deletion paths.
- Compared deployment commit with local source; recorded the difference.
- App and backend TypeScript checks passed after policy synchronization.
- Generated mobile/desktop public pages from the canonical policy content and
  checked their rendered layout, navigation and email links.
- No actual card/ID documents, production secrets or end-user data were uploaded
  to the public legal repository as part of the audit.

## Publishing the revised pages

Upload only `privacy.html`, `delete-account.html` and `.nojekyll` from `legal-pages/`
into `yatrenzo/yatrenzo-legal` on `main`, replacing the existing privacy file.
Do not upload the audit, app source, backend source, environment files or user data.
Wait for the Pages workflow to succeed and open both public URLs without login.
The existing privacy URL remains `/yatrenzo-legal/privacy.html`; the deletion URL
will be `/yatrenzo-legal/delete-account.html`.

Do not treat this audit as a statement that the app is ready for Google Play
submission. The deletion, access control, consent and retention gaps above require
implementation/operational decisions as well as accurate policy text.

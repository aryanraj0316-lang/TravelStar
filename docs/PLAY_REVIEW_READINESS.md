Google Play review preparation — 7 November 2026

Implemented safeguards

- Safety & reports is accessible on signed-in screens. Story options and chat message options link directly to the relevant report target.
- Users can report public content, users and messages they can already access, block people, unblock them and see report outcomes.
- Blocks are enforced on the server for direct chats, enquiries, messages and private image access. Group messages are delivered only to non-blocking recipients. Social reads hide blocked authors and moderated content. Financial obligations remain available.
- Current content rules must be accepted before posting. Registration shows an explicit acceptance control; returning users are prompted. Server enforcement covers uploads, messages and supported publishing routes.
- Moderators review text and media evidence, record reasons, hide content, suspend accounts, dismiss reports and restore content. Decisions are recorded separately. Report/evidence retention is 180 days.
- Private/invite-only trip details and listings are restricted to the creator and members. Sample guide profiles are excluded from other users' discovery and booking access.
- The public payment bypass remains disabled outside automated tests. Sandbox keys are rejected in production. Complimentary reviewer fixtures create no captured payment or administrator privilege.
- Password-reset codes are not logged; undelivered codes are invalidated.
- The current policy and deletion instructions are served publicly at /privacy and /delete-account on the backend, as well as generated in legal-pages.

Operator activation (required once)

1. Update/restart the app and sign in with a separate operator account. Do not activate the Google reviewer account.
2. Open Safety → Moderator activation. Paste the one-time code from backend/export-temp/moderator-activation.txt in the isolated release workspace. This file is local and excluded from Git. Never share it with reviewers or commit it.
3. Refresh or sign out/in. Check the moderator queue regularly, investigate reports promptly, record actions and handle appeals at 1bharatgo@gmail.com. Automated code cannot perform ongoing human moderation.
4. In the moderator screen, enter the dedicated review account's phone number and prepare complimentary review scenarios. These are private and explicitly labelled. The guide profile remains unverified and cannot be booked by the public.

Reviewer instructions

Log in using the provided mobile number and app password. If +91 is already displayed, enter the remaining ten digits. No OTP is required. Open Safety → Review scenarios for the complimentary traveller booking, organizer tools, guide tools and chats. These scenarios do not charge money. Live payment checkout depends on Razorpay activation and is not demonstrated by the complimentary scenarios.

Before submission

- Complete Razorpay onboarding or exclude unavailable paid checkout from the submitted product. Do not claim full access to unavailable payment functionality.
- Activate the operator and prepare the actual reviewer account; verify the submitted build, not only the backend login.
- Build the Android App Bundle from the updated source using the production EAS profile. Preview-channel OTA updates do not themselves upload a new App Bundle to Google Play.
- Update Play Console's privacy-policy URL to https://travelstar.onrender.com/privacy (or publish the generated updated HTML to the existing GitHub Pages URL). Set the account-deletion web URL to https://travelstar.onrender.com/delete-account.
- Answer blocking/reporting/moderation questions based on the submitted, tested build. Friends-only interactions remain unsupported.
- Finish Data safety, target audience, content ratings, store listing and the required closed test. No tool or test can guarantee Google approval.
- Check the moderator readiness endpoint for payment/email configuration and historical media revocation. Unsupported historical sources must not be described as fully revoked until verified.

Release verification

Run backend migrations against an isolated database, type checks, backend lint, regression tests and Android export. Release only after clean CI passes. Verify authentication, block enforcement, report/queue authorization, sample-record privacy and account deletion against the deployed API, then publish the Android update.

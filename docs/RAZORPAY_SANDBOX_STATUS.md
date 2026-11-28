# Razorpay sandbox validation — 28 November 2026

The downloaded test credentials are stored only in the ignored local file
`.expo/razorpay-test.env.local`. No credentials are included in this document.
Production has not been switched to sandbox mode.

## Verified

- Razorpay accepted the test credentials and created an INR 1 sandbox order.
- The backend persisted the gateway order and reused it on an identical retry.
- The real web checkout SDK opened in Test Mode through the app's checkout wrapper.
- A real Razorpay mock-bank checkout completed and the gateway confirmed capture of INR 1 in test mode.
- The callback signature verified, a booking verification token was issued, and one seat was held. Repeating confirmation did not reserve a second seat.
- Razorpay accepted the full INR 1 sandbox refund. No real money moved.
- An invalid webhook signature was rejected without changing the payment.
- A locally signed `payment.failed` webhook was accepted and left seats available.
- The direct-payment simulation was disabled during the real gateway API check.
- All 22 booking, production-payment-policy and organizer-payout regression tests passed against an isolated local database. Some gateway operations in those regression tests are mocked; these are not evidence of real gateway captures/refunds.

## Reproduce backend sandbox check

Run `node scripts/check-razorpay-sandbox.cjs` from the repository root.
It requires installed backend dependencies, the ignored test-key file, and the
existing isolated local PostgreSQL database recorded in `.expo/web-check-db.txt`.
It refuses live keys and any other database name, cleans up its database fixtures,
and prints only check results. Test orders remain in Razorpay's sandbox history.
It uses the real web checkout wrapper in headless Chrome, completes the provider's
mock-bank success flow, verifies the payment at the provider, confirms the booking
and requests a sandbox refund. Chrome and the root Playwright/TypeScript dependencies
must also be installed. It does not invent a captured payment.

## Still required before calling payments ready

- Exercise checkout cancellation and payment failure from the installed website/app UI. The automated success flow calls the shared wrapper and backend services, rather than navigating the full trip-booking UI.
- Register a webhook on a publicly reachable sandbox backend and confirm actual Razorpay delivery. Local signature tests do not establish provider delivery.
- Test checkout in an installed Android development/release build; Expo Go cannot load the native Razorpay module.
- Have the adult merchant account owner configure live credentials and webhook settings for production. Test keys are deliberately rejected by the production backend.

The shared webhook route is `/api/v1/trip-payments/webhook`. The receiver handles
`payment.captured`, `payment.failed`, `refund.failed`, and `transfer.failed`.
The webhook secret belongs on the backend as `RAZORPAY_WEBHOOK_SECRET`; the key
secret must never be embedded in the website or Android bundle.

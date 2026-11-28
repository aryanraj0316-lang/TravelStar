# Public Razorpay test receiver

This separate deployment uses `backend/src/sandbox-server.ts`, not the normal
production server. Its only public routes are `GET /health` and
`POST /api/v1/trip-payments/webhook`. It does not expose registration, payment
initiation, simulation, user records, or the rest of the application API.

## Deployment

- Host: `https://yatrenzo-sandbox.onrender.com`
- Render service: `srv-dc5fqk7f3r2c73enm16g`, Singapore, free plan.
- Source branch: `sandbox/payments-webhook`, automatic deployment off.
- Root: `backend`; Dockerfile: `./Dockerfile`; Docker command:
  `node dist/sandbox-server.js`.
- Database: separate `yatrenzo_sandbox` PostgreSQL database, owned by the
  dedicated `yatrenzo_sandbox` login. No production data is copied.

The server refuses startup unless it has test-prefixed Razorpay credentials,
a webhook secret of at least 32 characters, the dedicated sandbox database/login,
matching migration connection, `NODE_ENV=development`, and
`ALLOW_TEST_PAYMENTS=false`. Express itself runs with production error handling.
The main production server's rejection of sandbox credentials is unchanged.

Environment variable names:

```
NODE_ENV=development
ALLOW_TEST_PAYMENTS=false
DATABASE_URL=<sandbox connection>
DIRECT_URL=<same sandbox connection>
DATABASE_POOL_SIZE=2
JWT_SECRET=<unique random secret>
RAZORPAY_KEY_ID=<rzp_test_ key>
RAZORPAY_KEY_SECRET=<test secret>
RAZORPAY_WEBHOOK_SECRET=<unique random webhook secret>
```

The real values are stored in Render environment settings and the ignored local
`.expo/razorpay-public-sandbox.env.local`. Never commit that file. Deployment and
webhook identifiers are recorded in `.expo/razorpay-public-sandbox-state.json`.

## Provider subscription

Register the HTTPS webhook URL in the Razorpay **test** account with the same
webhook secret and these events:

- `payment.captured`
- `payment.failed`
- `refund.processed`
- `refund.failed`

`transfer.failed` is handled by the application but is not an available event
for this gateway account. It is not part of this payment/refund subscription;
organizer transfers require separate Razorpay Route activation.

The setup API follows Razorpay's own WooCommerce implementation:
https://github.com/razorpay/razorpay-woocommerce/blob/master/woo-razorpay.php

## Verification

`node scripts/check-razorpay-public-sandbox.cjs` creates synthetic fixtures only
in the dedicated database, opens the real shared web checkout wrapper against
Razorpay's mock bank, and waits for the hosted receiver to complete the booking.
It deliberately never submits a browser payment confirmation or calls the
capture service itself. A database transition to CAPTURED with a receipt and one
held seat therefore verifies provider-to-server delivery. It also requests a
sandbox refund and waits for the provider's refund notification.

The check rejects invalid signatures, confirms other API routes remain closed,
cleans up its synthetic fixtures, and writes a secret-free result to
`.expo/razorpay-public-sandbox-result.json`. Test transactions remain in the
Razorpay dashboard. No real money moves.

This receiver does not enable real payments on yatrenzo.com or the Android app.

The Render free instance sleeps after inactivity and can take about a minute to
wake. The first notification after sleep may require a provider retry. This is
a test environment, not an always-on production receiver. See
https://render.com/docs/free#spinning-down-on-idle.

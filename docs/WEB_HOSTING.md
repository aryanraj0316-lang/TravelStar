# Yatrenzo website hosting

Render Static Site: `yatrenzo-web`, service `srv-dc41t2p7lnhs73f5kebg`.
Website: https://yatrenzo-web.onrender.com
Backend: https://travelstar.onrender.com (shared with Android).

Build from repository root on `master` using `npm ci && npm run build:web`,
publish `dist`. Use Node 22, `SKIP_INSTALL_DEPS=true` and
`EXPO_PUBLIC_API_URL=https://travelstar.onrender.com`. The build clears Metro's
cache and verifies the exported pages and backend address before publication.
The frontend needs no database passwords or R2 server credentials.

The checked-in `render.yaml` describes the frontend only. Do not create a
duplicate backend or database from it. API deployment is managed separately.
Exact static route rewrites preserve the individual exported HTML pages.

The backend CORS allowlist includes the exact website origin. Future domains
must be added both to `CORS_ALLOWED_ORIGINS` on the backend (restart required)
and the R2 bucket's CORS policy for browser PUT uploads. Preserve other allowed
origins. `deploy/render-r2-cors.json` contains the website rule to append; do not
replace unrelated existing bucket rules. Validate preflight and a real browser
upload after saving. The current backend R2 token lacks bucket CORS permissions.

Private connection files live under Git-ignored `.expo/`. Revoke the temporary
Render API key after deployment checks and keep all secrets out of screenshots.
Paid checkout remains dependent on Razorpay live activation/configuration;
hosting a website does not activate a payment account.

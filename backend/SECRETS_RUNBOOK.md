# Secrets runbook

## Rotating `JWT_SECRET`

Rotating this secret immediately invalidates every existing access and refresh token — every user is signed out. Do this if the secret is ever exposed (committed to git, leaked in logs, etc.) or on a routine schedule.

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. Set `JWT_SECRET` to the new value in the deployment's environment (never in a committed file).
3. Restart the backend. `src/config/env.ts` validates the new value on boot (must be ≥32 bytes) and refuses to start otherwise.
4. All existing sessions are now invalid; clients will get `401` and go through the refresh flow, which will also fail, forcing re-login. This is expected.

## Rotating `DATABASE_URL` (e.g. after a Neon password rotation)

1. Rotate the password from the Neon dashboard.
2. Update `DATABASE_URL` in the deployment environment.
3. Restart the backend.
4. Confirm `/health` responds and a real request that touches the DB succeeds.

## If a secret was committed to git

Rotating the live value (above) removes the *working* credential, but the old value still sits in git history and should be treated as permanently compromised — do not just rely on `.gitignore` going forward. If the repository has ever been pushed anywhere, especially to a public remote:

1. Rotate immediately (steps above) — this is the only step that actually revokes access.
2. Treat the repository's history as containing the leaked value. Removing it from history (`git filter-repo` or the BFG Repo-Cleaner) is optional cleanup once rotation is done, not a substitute for rotation.
3. Check provider audit logs (Neon, etc.) for any access from unfamiliar IPs during the exposure window.

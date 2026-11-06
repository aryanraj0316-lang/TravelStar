# Privacy fixes: rollout and verification

These changes are implemented locally. They do not change the running Render
service, published Android binary, GitHub policy page or storage permissions.
Publish the revised policy only after the corresponding behavior is deployed.

## What changed

- Account deletion captures legacy story filenames before removing attribution,
  removes stories/interactions, account-linked notification/review/map snapshots,
  system announcements, restrictive booking/call/transaction/group relations and
  the account. New story ownership and copied-message/notification subject FKs
  prevent late writes from recreating deleted identifiers. Sessions cascade;
  access tokens and socket handshakes check the account still exists. Connected
  sockets are disconnected after deletion.
- A durable `MediaErasureJob`, written in the deletion transaction, survives the
  account. The worker runs every minute, retries provider failures, deletes local
  legacy story files and all owned object prefixes, including replaced and
  unattached uploads. It repeats after ten minutes to cover five-minute signed
  PUT links issued before deletion. Versioned buckets require version removal,
  not just delete markers. Storage outages leave jobs queued, not reported done.
- Chat images (maximum 5 MB, JPEG/PNG/WebP) now use PostgreSQL byte storage and
  opaque `chat-private:` references. The authenticated endpoint rechecks current
  room membership, returns `Cache-Control: no-store`, and never publishes bucket
  URLs. Sending checks attachment owner and room. Native and web clients use this
  path, with no public URL/data/local-file fallback. Inline bytes are used only
  in memory for display after authenticated retrieval. This is not end-to-end
  encryption. Include this increased database storage in capacity/backups planning.
- Guide broadcasting requires the sharing setting and an explicit start action.
  Settings, GPS updates and Stop Live share a database row lock. Sharing-off and
  Stop Live delete positions and clear presence; guide reads/map pins require an
  active broadcast and a position newer than one minute. Re-enabling sharing does
  not restart broadcasting. Manually sent chat/SOS coordinates are separate.

## Server-managed historical media cleanup

The follow-up migration adds a durable legacy-object outbox and checkpoint. The
live backend now converts old inline/bucket chat images in bounded background
batches using its own database and storage credentials. It retains sources until
all message references have private replacements, inventories orphaned objects
and historical versions after old upload links expire, then retries deletion.
Each original public URL must return 403/404 before its revocation is acknowledged.
Account deletion cannot remove this outbox prematurely. Unknown source references
are preserved for operator review rather than silently discarded.

GET /ready exposes only the aggregate completion flag and phase under data.privacy;
it does not expose file URLs, account identifiers or message counts. Completion
requires conversion and old-source revocation, not merely successful deployment.
The manual migration command remains available for an operator investigating a
failure; routine conversion no longer requires copying production credentials locally.

## Deployment sequence

1. Apply `20261106170000_privacy_boundaries` using the normal Prisma deployment
   workflow. This creates private attachments and the cleanup outbox, adds the
   broadcast switch (off for existing guides), and enforces story ownership.
   Legacy orphan stories with a known user ID are queued for media cleanup before
   removal. Back up and review database changes using the normal release process.
2. Deploy the backend to **every instance**, and release the updated native/web
   clients. Old clients receive `410 UPGRADE_REQUIRED` when asking for public chat
   upload URLs. Existing public attachment URLs are withheld from message history
   until migrated, so some historical photos will temporarily be unavailable.
3. Immediately deny anonymous/public access to the `chat-media/` bucket prefix
   and purge its CDN caches, while retaining authenticated server access for
   migration. This is essential: hiding a URL in the app cannot revoke a URL
   someone already copied. The new chat implementation needs no public bucket.
4. After all old servers are stopped and at least ten minutes have elapsed,
   run **one** migration process in `backend/` with the deployed environment:

   ```sh
   npm run privacy:migrate-chat -- --old-upload-links-expired
   ```

   It reads only the configured bucket's recognized keys (no arbitrary HTTP
   fetching), converts existing photos/inline images to private bytes, retries
   source deletion via persisted `legacyKey`, and removes remaining old
   `chat-media/` objects and versions, including unattached uploads. Unknown
   external/local references are preserved for operator review, not fetched. A missing/corrupt/oversize
   managed image or provider error stops the command with a nonzero exit; inspect
   that asset before retrying. Successful conversion is not rolled back merely
   because deleting the old source failed. Do not run concurrent migration jobs.
5. Verify old copied URLs return 403/404, including any historical version URLs
   and CDN endpoints. Do not claim historical public links are revoked until
   those checks pass. The operator must purge caches outside the bucket API.
6. Confirm the backend can list/delete the user prefixes and can get bucket
   versioning/list/delete versions where supported. AccessDenied must be fixed;
   it intentionally leaves jobs queued. Providers explicitly lacking versioning
   use current-object deletion. Inspect pending `MediaErasureJob` and attachment
   `legacyKey` counts after rollout and after a synthetic deletion. The normal
   worker starts only after a successful schema migration check.
7. Publish only the generated legal HTML and `.nojekyll` to the legal repository
   once behavior and policy agree. Keep Render described as current until the
   actual Fly.io migration is complete.

## Known historical boundaries

Old direct uploads which were never attached to a story had no owner in their
filenames. Already-deleted story rows, null/unrecoverable user IDs, old buckets,
renamed CDN bases and recipient copies cannot be reliably attributed from the
current database. Inventory these using storage logs/backups and handle them
operationally; do not promise automatic erasure of unattributable historical
files. New disk filenames include ownership even before publishing a story.

Old system announcements lacked subject attribution. Account erasure clears
unattributed system announcements from affected chat rooms conservatively; this
can remove other old system announcements in those rooms. Ordinary messages
written by other people remain. New copies carry the subject account FK.

Backup rotation, provider/legal retention and recipient-held copies still need
the operator's actual retention process. The cleanup queue is not proof of an
immediate purge of every backup or CDN. This does not resolve the separate audit
findings about government ID collection, age enforcement or consent disclosure.

## Verification

All 106 tests across seven selected suites passed; frontend and backend TypeScript checks passed.
The temporary test server was stopped after verification.

Validated with synthetic accounts on a fresh, isolated local PostgreSQL 18
instance (`127.0.0.1:55439`), not the live database:

- Fresh migration deployment; story/account FK rejection after erasure.
- Actual account-deletion API, retained ordinary messages, removed snapshots,
  stories/interactions, restrictive relations and private attachments.
- Room-member/outsider/anonymous/removed-member image access and socket rejection
  of arbitrary public media references; attachment owner/room binding.
- Concurrent sharing-off/GPS writes, explicit start/stop and stale-position reads.
- Storage outage retries, delayed final sweep, pagination, owned prefixes,
  historical versions, partial deletion errors and safe disk paths.
- Legacy private conversion with retryable source deletion.
- Existing authentication, socket security, room leaving and guide-role suites.
- Frontend/backend TypeScript checks.

Run the destructive privacy integration suite only against its guarded local
test database. `privacy-storage.test.ts` uses mocked storage, never a real bucket.
Live bucket/CDN behavior and an installed-device release remain rollout checks.

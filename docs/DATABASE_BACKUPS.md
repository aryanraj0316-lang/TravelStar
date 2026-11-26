# Production database recovery

The `Encrypted database backup` GitHub Actions workflow requests an hourly
snapshot at minute 17 and retains archives for 14 days. Only encrypted database
content is uploaded; credentials and the encryption key use Actions secrets.
The matching public Prisma schema and migrations accompany each backup.

Secrets are `AIVEN_BACKUP_DATABASE_URL` and `AIVEN_BACKUP_KEY_BASE64` (32 random
bytes encoded as base64). Keep a separate offline copy of the key; changing or
losing the key makes previous archives unreadable. Never commit it. The initial
key is also stored locally under the Git-ignored `.expo/aiven-backups/` directory.
Keep that directory and `.expo/aiven.env` private and out of deployment bundles.

This is a low-cost snapshot solution, not continuous point-in-time recovery.
GitHub schedules can be delayed or dropped. Public-repository schedules can be
disabled after 60 days without repository activity. Check Actions failures and
backup freshness daily, re-enable disabled schedules, and test a restore monthly.
The system cannot guarantee zero loss of messages or paid bookings. Retain
Aiven's provider backups too, and upgrade recovery coverage as traffic grows.

## Recover an archive

1. Download a successful workflow artifact from the repository Actions tab.
2. Retain its matching `schema.tar.gz` and `manifest.json`; verify the encrypted
   file's SHA-256 against the manifest.
3. Load the recovery key securely in a local session and use `decryptDump`
   exported by the matching `scripts/database-backup.cjs` to decrypt the custom
   PostgreSQL archive. Do not print the key or decrypted data to logs.
4. Restore into a NEW, isolated PostgreSQL service/database. Keep live data
   untouched. Aiven's dump includes provider-specific attributes such as
   `pg_attver` which stock PostgreSQL 18.0 cannot apply. For that target, rebuild
   the schema using the bundled Prisma migrations, clear only migration-seeded
   rows in the NEW recovery database, then restore the archive's public data
   with `pg_restore --data-only --disable-triggers --schema=public`. This method
   needs suitable privileges in the isolated target; do not disable constraints
   or truncate tables in the live database. For a managed destination without
   those privileges, arrange a compatible staged restore before switching.
5. Compare row counts and migration history, then test login, trips, messages,
   payment history and R2 media references before cutover.

An actual Aiven archive was decrypted and restored locally on 2026-11-26:
48 migrations, eight destinations, zero user accounts. Provider-only schema
attributes were bypassed by rebuilding the schema from release migrations.
That verifies the initial archive; it does not replace future restore tests.

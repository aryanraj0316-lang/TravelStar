# Migrations

## Workflow

- Local development: change `schema.prisma`, then `npx prisma migrate dev --name <description>`. This generates and applies a migration and regenerates the client.
- CI/CD and production: `npx prisma migrate deploy`. Non-interactive, applies only pending migrations, never prompts.
- Never run `prisma db push` again outside a throwaway local experiment — it doesn't produce a migration file, so it's invisible to every other environment and to rollback.

## Rollback

Prisma has no automatic "undo" for an applied migration. To roll back:

1. Write a new migration that reverses the change (e.g. if migration N added a column, migration N+1 drops it). This keeps the migration history linear and matches what every other environment will do when it deploys.
2. For a change that already lost data by the time the problem is noticed (e.g. a dropped column), the only real rollback is restoring from a backup taken before the migration ran — see the backup/restore runbook (Phase 11). A forward-fixing migration cannot recover data that a prior migration already deleted.
3. If a migration fails partway through in production, `prisma migrate deploy` will refuse to continue until it's resolved: fix the underlying issue, then either edit the migration and re-deploy (if it never partially applied) or run `prisma migrate resolve --rolled-back <name>` / `--applied <name>` depending on whether its statements actually took effect, matching what really happened in the database.

## This project's history

- `000000000000_baseline` — the schema as it stood before Phase 4, baselined with `prisma migrate diff --from-empty` and marked applied via `prisma migrate resolve` (the database already had this schema from earlier `db push` usage, so the migration was never executed — only recorded).
- `000000000001_phase4_data_layer` — money columns to `Decimal(12,2)`, free-form strings to enums, missing indexes, referential integrity fixes, and the `availableSeats >= 0` check constraint. Hand-edited from the raw `prisma migrate diff` output to convert existing column data with `USING` casts instead of the default drop-and-recreate, which would have silently discarded the live Alert/MonsoonAdvisory content — see the migration file's header comment.
- `000000000002_notification_read` — per-user read state for broadcast notifications (§5.8).
- `000000000003_group_member_user_index_and_default_drift` — the missing `GroupMember.userId` index (§4.3) plus unrelated DB-level `updatedAt` default drift Prisma detected against an earlier `db push` state.

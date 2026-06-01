-- Phase 3 item 21 (Wave F6): auto-archive completed relays after 30 days.
-- Adds a nullable `completedAt` timestamp on Batch. The new auto-archive
-- cron uses this column as the retention anchor (now - 30 days). The
-- existing `deletedAt` column is the archive mechanism; this column is
-- only the trigger.
--
-- Behavior:
--   1. ALTER TABLE adds the column as nullable, no default. Existing rows
--      get NULL for completedAt.
--   2. Backfill: any batch already at currentStep = 'completed' needs a
--      completedAt value so the cron has something to compare against on
--      first run. Best approximation: the createdAt of the most recent
--      RelayEvent that transitions INTO 'completed' for that batch. If
--      no such event exists (data from before the activity feed shipped),
--      fall back to the batch's own createdAt.
--
-- The Batch model does not have an updatedAt column (verified against
-- schema.prisma 2026-06-01), so the RelayEvent join is the cleanest
-- approximation of "when was this batch last touched."
--
-- Wrapped in a single transaction so the column add + backfill are atomic.

BEGIN;

-- AlterTable
ALTER TABLE "batches" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill: existing completed batches get completedAt = the createdAt of
-- the most recent RelayEvent whose toStep = 'completed', else the batch's
-- own createdAt.
UPDATE "batches" AS b
SET "completedAt" = COALESCE(
  (
    SELECT MAX(e."createdAt")
    FROM "relay_events" e
    WHERE e."batchId" = b."id"
      AND e."toStep" = 'completed'
  ),
  b."createdAt"
)
WHERE b."currentStep" = 'completed'
  AND b."completedAt" IS NULL;

COMMIT;

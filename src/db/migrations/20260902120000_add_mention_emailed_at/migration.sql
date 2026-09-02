-- Add Mention.emailedAt for notification rollup emails (2026-09-02).
--
-- A mention is "owed an email" while readAt IS NULL and emailedAt IS NULL and
-- its createdAt sits inside the age window. That pair of columns IS the queue,
-- so this feature adds no queue table.
--
-- Additive and nullable, so every existing row starts as "not yet emailed".
-- The 24 hour maximum age enforced in application code is what stops this
-- backfill-free default from mailing everyone about historical mentions on the
-- first deploy.
--
-- The index supports the hot probe, which runs on every notification bell poll
-- (every 20s per signed in user) and almost always matches nothing.

BEGIN;

ALTER TABLE "mentions" ADD COLUMN "emailedAt" TIMESTAMP(3);

CREATE INDEX "mentions_emailedAt_readAt_createdAt_idx"
  ON "mentions" ("emailedAt", "readAt", "createdAt");

COMMIT;

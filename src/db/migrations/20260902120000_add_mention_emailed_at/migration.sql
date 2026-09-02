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
-- (every 20s per signed in user) and almost always matches nothing. It is
-- built AFTER the backfill below so it is written once over final data,
-- instead of once at column-add time and again as the backfill's UPDATE
-- touches every row.
--
-- The backfill below marks every mention that exists AT MIGRATION TIME as
-- already emailed, on Julio's ruling. Without it, every unread mention from
-- the previous 24 hours becomes due the instant this migration lands, and the
-- next bell poll or timer tick mails everyone a catch-up rollup about things
-- they already have sitting in their bell. Stamping emailedAt now means the
-- feature only ever emails notifications created AFTER deploy, so nobody gets
-- a surprise about a mention they have had for a day. This also makes deploy
-- timing irrelevant: there is no window during which flipping this migration
-- live can trigger a surprise send, whether that happens at 9am or 2am.

BEGIN;

ALTER TABLE "mentions" ADD COLUMN "emailedAt" TIMESTAMP(3);

UPDATE "mentions" SET "emailedAt" = now() WHERE "emailedAt" IS NULL;

CREATE INDEX "mentions_emailedAt_readAt_createdAt_idx"
  ON "mentions" ("emailedAt", "readAt", "createdAt");

COMMIT;

-- Adds resolvable state to a client's general review note (ReviewItem.comment)
-- so the review-session resolve checklist (2026-07-01) can mark a note done.
-- Additive + nullable: null = unresolved. No backfill; historically-addressed
-- posts stay done via addressedAt, and their note flag stays null harmlessly.

BEGIN;

ALTER TABLE "review_items" ADD COLUMN "noteResolvedAt" TIMESTAMP(3);
ALTER TABLE "review_items" ADD COLUMN "noteResolvedBy" TEXT;

COMMIT;

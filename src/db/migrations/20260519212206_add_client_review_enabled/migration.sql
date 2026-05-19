-- Add per-Client toggle. Default false for new rows; backfill existing rows
-- to true so current clients keep going through client review.
ALTER TABLE "clients"
  ADD COLUMN "clientReviewEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "clients" SET "clientReviewEnabled" = true;

-- Snapshot column on Batch. Defaults to true on both new and existing rows
-- so any batch already in flight keeps the 14 step flow it started under.
ALTER TABLE "batches"
  ADD COLUMN "clientReviewEnabled" BOOLEAN NOT NULL DEFAULT true;

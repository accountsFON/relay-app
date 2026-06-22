-- Add per-org review window length (days of client silence before auto-advance).
ALTER TABLE "organizations" ADD COLUMN "reviewWindowDays" INTEGER NOT NULL DEFAULT 7;

-- Add per-relay auto-advance opt-out flag.
ALTER TABLE "batches" ADD COLUMN "autoAdvanceOnTimeout" BOOLEAN NOT NULL DEFAULT true;

-- Add window-start stamp, set when a relay enters Client Review.
ALTER TABLE "batches" ADD COLUMN "clientReviewStartedAt" TIMESTAMP(3);

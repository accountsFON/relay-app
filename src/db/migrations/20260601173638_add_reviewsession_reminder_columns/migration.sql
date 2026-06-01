-- Add two nullable reminder timestamps to ReviewSession. Both default null
-- and are set by the sendReviewReminders cron when the matching threshold
-- (48h / 96h after startedAt) fires for the first time on a session.
--
-- Spec: projects/relay-app/2026-05-19-reviewer-reminder-cron-design.md

-- AlterTable
ALTER TABLE "review_sessions"
  ADD COLUMN "reminder48hSentAt" TIMESTAMP(3),
  ADD COLUMN "reminder96hSentAt" TIMESTAMP(3);

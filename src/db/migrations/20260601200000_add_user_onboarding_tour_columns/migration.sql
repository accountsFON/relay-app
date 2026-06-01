-- Phase 4 item 25: /welcome launch pad + 3-stop guided tour.
--
-- Two nullable columns on User track per-user onboarding state. Null on
-- both means the user has neither completed nor skipped the tour, so the
-- (app) layout redirects them to /welcome and the TourProvider can auto
-- fire. Set when the user dismisses /welcome ("Skip, I'll explore" or
-- top right X) or when the tour finishes / is dismissed.
--
-- Backfill: every existing user predates this surface and would otherwise
-- get the surprise redirect on next sign in. We grandfather everyone
-- whose account is older than 1 day by stamping both columns with
-- createdAt. Users created within the last day stay null and will see
-- /welcome on their next session, which is the desired behaviour for a
-- brand new account.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "launchPadDismissedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingTourSeenAt" TIMESTAMP(3);

-- Backfill: grandfather existing accounts so they don't get redirected
-- to /welcome on next login. Stamps both timestamps with createdAt for
-- users older than 24 hours.
UPDATE "users"
SET "onboardingTourSeenAt" = "createdAt",
    "launchPadDismissedAt" = "createdAt"
WHERE "createdAt" < NOW() - INTERVAL '1 day';

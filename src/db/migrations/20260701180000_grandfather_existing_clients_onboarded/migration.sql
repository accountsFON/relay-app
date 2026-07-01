-- Grandfather existing clients (2026-07-01 hotfix).
--
-- The client-page onboarding checklist (PR #293) gates Generate on
-- Client.onboardingCompletedAt. That field was only ever set by the admin
-- Onboarding queue; clients that were set up and generated content via the
-- Generate flow (the common path) never had it written, so post-deploy those
-- established, actively-serviced clients (e.g. ones mid-relay) were re-gated
-- behind a fresh onboarding checklist with Generate disabled.
--
-- Mark every currently-not-onboarded client as onboarded, using createdAt as
-- the effective completion timestamp (honest: they predate the feature). Only
-- clients created AFTER this migration runs start null, so the checklist
-- applies to new clients going forward, exactly as intended. Data-only,
-- idempotent (the WHERE clause skips already-onboarded rows; a re-run is a
-- no-op).
UPDATE "clients"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;

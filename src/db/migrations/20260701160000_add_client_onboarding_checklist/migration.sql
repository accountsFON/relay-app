-- Client-page onboarding checklist (2026-07-01): three attestation booleans
-- persist per-item progress. onboardingCompletedAt stays the gate. New rows
-- default false; existing already-onboarded clients keep onboardingCompletedAt
-- set and never see the checklist card, so their false booleans are inert.
ALTER TABLE "clients"
  ADD COLUMN "onboardingAccountFilledOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onboardingDesignFolderReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onboardingAssetsReceived" BOOLEAN NOT NULL DEFAULT false;

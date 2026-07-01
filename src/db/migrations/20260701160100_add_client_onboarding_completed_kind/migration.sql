-- Client onboarding completion activity (2026-07-01). Additive enum value only;
-- used at runtime by completeClientOnboardingAction, not within this migration.
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'client_onboarding_completed';

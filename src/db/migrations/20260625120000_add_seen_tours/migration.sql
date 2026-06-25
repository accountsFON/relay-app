-- Multi-tour onboarding: per-user list of completed/dismissed tour ids.
ALTER TABLE "users" ADD COLUMN "seenTours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

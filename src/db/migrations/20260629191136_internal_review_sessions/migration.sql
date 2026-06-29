-- Internal review parity Phase 1 (2026-06-29): teach ReviewSession to back an
-- INTERNAL (Clerk-user / AM) Design Review session beside the existing client
-- (magic-link) flow. Additive + backfilled so the client flow is untouched.
-- See projects/relay-app/2026-06-29-internal-review-parity-design.md.
--
-- Order matters:
--   1. Create the kind enum.
--   2. Add columns. kind defaults to 'client' (so every existing row is a
--      client session); batchId + reviewerUserId added nullable first.
--   3. Drop NOT NULL on magicLinkId (internal sessions have no magic link).
--   4. Backfill batchId for every existing row from its magicLink.batchId.
--   5. Enforce batchId NOT NULL only after the backfill.
--   6. Add the batchId + reviewerUserId FKs and the batchId index.
--
-- Identifier quoting mirrors Prisma's generated style (table = snake_case via
-- @@map, columns = camelCase, constraints = <table>_<col>_fkey / _idx).
--
-- Wrapped in a single transaction so the column add + backfill + NOT NULL +
-- FKs are atomic. The enum value is referenced only as a column DEFAULT here,
-- not in a query, so the same-transaction-add restriction does not apply.

BEGIN;

-- 1. The client/internal discriminator.
CREATE TYPE "ReviewSessionKind" AS ENUM ('client', 'internal');

-- 2. New columns. batchId + reviewerUserId start nullable; batchId is filled
--    by the backfill below before the NOT NULL constraint is set.
ALTER TABLE "review_sessions"
  ADD COLUMN "kind" "ReviewSessionKind" NOT NULL DEFAULT 'client',
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "reviewerUserId" TEXT;

-- 3. Internal sessions carry no magic link, so magicLinkId can be null now.
ALTER TABLE "review_sessions" ALTER COLUMN "magicLinkId" DROP NOT NULL;

-- 4. Backfill batchId for every existing (client) session from its magic link.
UPDATE "review_sessions" AS rs
SET "batchId" = ml."batchId"
FROM "magic_links" AS ml
WHERE rs."magicLinkId" = ml."id";

-- 5. Now that every row has a batchId, make it required.
ALTER TABLE "review_sessions" ALTER COLUMN "batchId" SET NOT NULL;

-- 6. Index + foreign keys.
CREATE INDEX "review_sessions_batchId_idx" ON "review_sessions"("batchId");

ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

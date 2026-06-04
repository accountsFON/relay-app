-- Client review is now opt-in (off by default).
--
-- The 2026-05-19 migration (20260519212206_add_client_review_enabled) backfilled
-- every existing client to true so in-flight work kept going through client
-- review. Off-by-default is now the product intent, so reset every client to
-- false. New clients already default false (schema @default(false) + the zod
-- client schema + the create form). In-flight batches snapshot the flag at
-- creation, so this only changes which steps FUTURE relays run; nothing
-- mid-flight reroutes. Any client can be re-enabled via the per-client toggle.
UPDATE "clients" SET "clientReviewEnabled" = false;

-- Align the Batch snapshot column default with the new intent. This is a
-- defensive default only: batch creation (finalize-post-generation) always sets
-- the value explicitly from the Client, so no existing path relies on it. Keeps
-- the schema's stated default consistent with "workflow client review off by
-- default" so a future batch-creation path can't accidentally default to on.
ALTER TABLE "batches" ALTER COLUMN "clientReviewEnabled" SET DEFAULT false;

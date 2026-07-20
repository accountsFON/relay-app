-- Data migration: backfill the Copy Review checklist for batches that the AI
-- pipeline created before createBatchForRun started seeding it (workflow-test
-- #8). `copy` is the first working step, so nothing ever transitions INTO it
-- to trigger a reseed -- these batches would otherwise stay empty forever.
--
-- Scope + safety:
--   * only live copy-step batches (currentStep='copy', deletedAt IS NULL)
--   * only batches with NO checklist rows at all, so admin-created batches
--     that already have their checklist are left untouched (their AM may have
--     items ticked; we never wipe in-progress work).
--   * item ids are generated with md5(batch id + label) so they are unique
--     without depending on cuid generation at the DB level -- and so a re-run
--     is a no-op even independent of the NOT EXISTS guard (matches the house
--     style of the sibling backfill migrations).
--
-- Labels are copied verbatim from CHECKLIST_SEED[copy] in
-- src/lib/relay-checklists.ts (required = true, checked = false).
--
-- Wrapped in a single transaction to match the sibling backfills.

BEGIN;

INSERT INTO "checklist_items" (id, "batchId", step, label, required, checked)
SELECT
  'mig_ccb_' || md5(b.id || ':' || seed.label),
  b.id,
  'copy'::"RelayStep",
  seed.label,
  true,
  false
FROM "batches" AS b
CROSS JOIN (
  VALUES
    ('Content has been reviewed for clarity, brand alignment, and messaging consistency'),
    ('CTAs and hashtags have been verified'),
    ('Copy edits have been finalized')
) AS seed(label)
WHERE b."currentStep" = 'copy'::"RelayStep"
  AND b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "checklist_items" ci WHERE ci."batchId" = b.id
  );

COMMIT;

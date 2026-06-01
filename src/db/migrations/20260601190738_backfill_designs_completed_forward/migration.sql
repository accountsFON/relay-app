-- Phase 3 item 15 PR1: walk every in-flight batch sitting on the retired
-- `designs_completed` step forward to `am_review_design`. The enum value
-- stays in the RelayStep type for now so historical RelayEvent rows render
-- cleanly; PR2 (Wave F5) will tombstone the enum value after a clean prod
-- audit confirms zero live batches at the dead step.
--
-- Behavior:
--   1. Snapshot the set of batch ids we are walking forward into a temp
--      table so subsequent statements only touch those rows.
--   2. Re-anchor each affected batch: currentStep -> am_review_design,
--      currentRole -> am, currentHolder -> client's assigned AM (fall back
--      to the existing currentHolder if the client has no AM assigned, so
--      the batch never loses its holder reference).
--   3. Wipe any checklist items still tagged with the old step on those
--      batches (matches the "reset always" semantics of reseedChecklistForStep).
--   4. Seed the merged am_review_design checklist for the walked batches
--      only: "Designs match brand guidelines", "Copy / image alignment
--      verified", "No spelling or layout issues", "Designs match copy
--      themes" (the last one merged in from the retired step).
--      Item ids are generated with md5(batch id + label) so they are
--      unique without depending on cuid generation at the DB level.
--
-- Batches that were already at am_review_design before this migration are
-- intentionally NOT reseeded; their AMs may already have items checked and
-- we do not want to wipe in-progress work. The 4th item ("Designs match
-- copy themes") will only appear on batches that arrive at the step after
-- this PR ships.
--
-- Wrapped in a single transaction so the batch row + checklist rewrite are
-- atomic.

BEGIN;

-- 1. Snapshot the set of batches we are walking forward.
CREATE TEMP TABLE _designs_completed_backfill_ids ON COMMIT DROP AS
SELECT id FROM "batches" WHERE "currentStep" = 'designs_completed';

-- 2. Re-anchor in-flight batches.
UPDATE "batches" AS b
SET
  "currentStep" = 'am_review_design',
  "currentRole" = 'am',
  "currentHolder" = COALESCE(c."assignedAmId", b."currentHolder")
FROM "clients" AS c
WHERE b."clientId" = c.id
  AND b.id IN (SELECT id FROM _designs_completed_backfill_ids);

-- 3. Drop any checklist items still tagged for the dead step on the
--    walked batches. Scoped to the snapshot set so we do not touch
--    unrelated checklist history.
DELETE FROM "checklist_items"
WHERE "step" = 'designs_completed'
  AND "batchId" IN (SELECT id FROM _designs_completed_backfill_ids);

-- 4. Seed the merged am_review_design checklist for the walked batches.
INSERT INTO "checklist_items" (id, "batchId", step, label, required, checked)
SELECT
  'mig_dcf_' || md5(b.id || ':' || items.label),
  b.id,
  'am_review_design'::"RelayStep",
  items.label,
  true,
  false
FROM "batches" AS b
CROSS JOIN (
  VALUES
    ('Designs match brand guidelines'),
    ('Copy / image alignment verified'),
    ('No spelling or layout issues'),
    ('Designs match copy themes')
) AS items(label)
WHERE b.id IN (SELECT id FROM _designs_completed_backfill_ids);

COMMIT;

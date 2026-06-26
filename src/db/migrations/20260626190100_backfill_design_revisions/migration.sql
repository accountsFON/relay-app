-- Merge design steps (2026-06-26): walk every in-flight batch sitting on the
-- retired `design_revisions` step forward to the surviving AM-held Design Review
-- step (`am_review_design`), in the "awaiting design revisions" sub-state so the
-- board still reads as "designer is reworking". The enum value stays in the
-- RelayStep type for historical RelayEvent rows; no live batch lands here after
-- this backfill.
--
-- Behavior (mirrors 20260601190738_backfill_designs_completed_forward):
--   1. Snapshot the affected batch ids into a temp table.
--   2. Re-anchor: currentStep -> am_review_design, currentRole -> am (the step is
--      AM-held; the prior holder was the designer), currentSubState ->
--      'awaiting_design_revisions', currentHolder -> client's assigned AM, falling
--      back to the existing holder when the client has no AM so the NOT NULL
--      currentHolder FK never breaks (COALESCE).
--   3. Wipe checklist items still tagged with the dead `design_revisions` step on
--      the walked batches (the retired seed is now empty; reset semantics).
--   4. Seed the am_review_design checklist for the walked batches only, so the
--      AM has the Design Review list to work. Item ids use md5(batch id + label)
--      so they are unique without DB-side cuid generation. Batches already at
--      am_review_design before this migration are NOT touched (in-progress work).
--
-- NOTE: kept in a SEPARATE migration from the ALTER TYPE ... ADD VALUE
-- (20260626190000_add_design_changes_requested) so the new enum value is
-- committed in its own transaction before any later use (Postgres cannot use a
-- newly added enum value in the same transaction that adds it). This UPDATE does
-- not reference the new enum value, but the split matches the repo convention.
--
-- Wrapped in a single transaction so the batch rows + checklist rewrite are atomic.

BEGIN;

-- 1. Snapshot the set of batches we are walking forward.
CREATE TEMP TABLE _design_revisions_backfill_ids ON COMMIT DROP AS
SELECT id FROM "batches" WHERE "currentStep" = 'design_revisions';

-- 2. Re-anchor in-flight batches to Design Review, AM-held, awaiting revisions.
UPDATE "batches" AS b
SET
  "currentStep" = 'am_review_design',
  "currentRole" = 'am',
  "currentSubState" = 'awaiting_design_revisions',
  "currentHolder" = COALESCE(c."assignedAmId", b."currentHolder")
FROM "clients" AS c
WHERE b."clientId" = c.id
  AND b.id IN (SELECT id FROM _design_revisions_backfill_ids);

-- 3. Drop any checklist items still tagged for the dead step on the walked batches.
DELETE FROM "checklist_items"
WHERE "step" = 'design_revisions'
  AND "batchId" IN (SELECT id FROM _design_revisions_backfill_ids);

-- 4. Seed the am_review_design checklist for the walked batches (matches
--    CHECKLIST_SEED[am_review_design] in src/lib/relay-checklists.ts).
INSERT INTO "checklist_items" (id, "batchId", step, label, required, checked)
SELECT
  'mig_drf_' || md5(b.id || ':' || items.label),
  b.id,
  'am_review_design'::"RelayStep",
  items.label,
  true,
  false
FROM "batches" AS b
CROSS JOIN (
  VALUES
    ('Every caption has corresponding visual content'),
    ('Designs align with brand guidelines'),
    ('Copy and image alignment have been verified'),
    ('Designs are free of spelling and layout issues'),
    ('Designs reflect the themes of the copy')
) AS items(label)
WHERE b.id IN (SELECT id FROM _design_revisions_backfill_ids);

COMMIT;

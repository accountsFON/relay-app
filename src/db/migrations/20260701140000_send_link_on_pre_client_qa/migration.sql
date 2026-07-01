-- Send-link on Pre-Client QA (2026-07-01): the required "Send review link"
-- checklist item now lives on am_qa_pre_client (step 5) instead of
-- am_review_design (step 4). Backfill in-flight relays so none double-prompt.
--
-- reseedChecklistForStep wipes+recreates only the CURRENT step's items, so
-- batches past a step hold no stale items. This backfill therefore only needs
-- to touch batches currently sitting on the two affected steps.
--
--   1. Remove the premature send-link item from Design Review. Under the new
--      seed it should never exist there; only batches currently on
--      am_review_design still have it (it blocks their pass). Safe to delete
--      scoped by label + step.
--   2. Add the required send-link item to batches currently on am_qa_pre_client
--      with client review enabled that lack it, checked iff an active
--      (non-revoked, unexpired) magic link already exists (link already sent
--      under the old flow) so already-sent relays are auto-satisfied and unsent
--      ones get the gate. md5 id keeps it unique without DB-side cuid gen.
--
-- Data-only migration (no schema change). Atomic.

BEGIN;

-- 1. Drop the premature Design Review send-link item.
DELETE FROM "checklist_items"
WHERE "label" = 'Send review link'
  AND "step" = 'am_review_design';

-- 2. Add the send-link gate to in-flight Pre-Client QA batches (client review on)
--    that lack it, pre-checked when a live link already exists.
INSERT INTO "checklist_items" (id, "batchId", step, label, required, checked)
SELECT
  'mig_slq_' || md5(b.id || ':send-review-link'),
  b.id,
  'am_qa_pre_client'::"RelayStep",
  'Send review link',
  true,
  EXISTS (
    SELECT 1 FROM "magic_links" ml
    WHERE ml."batchId" = b.id
      AND ml."revokedAt" IS NULL
      AND ml."expiresAt" > now()
  )
FROM "batches" AS b
WHERE b."currentStep" = 'am_qa_pre_client'
  AND b."clientReviewEnabled" = true
  AND NOT EXISTS (
    SELECT 1 FROM "checklist_items" ci
    WHERE ci."batchId" = b.id
      AND ci."step" = 'am_qa_pre_client'
      AND ci."label" = 'Send review link'
  );

COMMIT;

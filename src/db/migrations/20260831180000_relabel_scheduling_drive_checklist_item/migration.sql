-- Relabel the Scheduling step's Drive checklist item (2026-08-31).
--
-- The Drive graphics archive now fires automatically when the AM clicks
-- "Export CSV & go to NectrCRM" on the Scheduling step, instead of running as a
-- side effect of Finish. So the checklist item stops being an instruction to go
-- and do the upload, and becomes a prompt to confirm the automatic one landed.
--
--   'Graphics have been uploaded to Google Drive'
--     -> 'Check that the designs got uploaded to the Google Drive'
--
-- reseedChecklistForStep wipes and recreates items on every Pass, so batches
-- that pass INTO scheduling after this deploy pick up the new label from
-- CHECKLIST_SEED on their own. This backfill exists only for relays already
-- SITTING on scheduling right now, which would otherwise keep the old wording
-- until they were sent back and passed forward again.
--
-- UPDATE rather than delete-and-insert so an AM who has already ticked the item
-- keeps their tick.
--
-- Data-only migration (no schema change). Idempotent: re-running matches nothing.

BEGIN;

UPDATE "checklist_items"
SET "label" = 'Check that the designs got uploaded to the Google Drive'
WHERE "label" = 'Graphics have been uploaded to Google Drive'
  AND "step" = 'scheduling';

COMMIT;

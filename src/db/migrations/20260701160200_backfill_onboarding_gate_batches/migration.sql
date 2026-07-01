-- Onboarding move (2026-07-01): onboarding_gate is retired from the live
-- pipeline. Any batch still sitting on it (only reachable via the now-removed
-- copy -> onboarding_gate send-back) is nudged forward to Copy Review, AM-held,
-- generating sub-state. Its stale onboarding_gate checklist rows are cleared;
-- the copy checklist reseeds on the batch's next pass (reseedChecklistForStep),
-- and copy items are non-blocking for generation. Idempotent + safe when zero
-- rows match.
BEGIN;

UPDATE "batches"
SET "currentStep" = 'copy'::"RelayStep",
    "currentRole" = 'am'::"RelayRole",
    "currentSubState" = 'generating'
WHERE "currentStep" = 'onboarding_gate'::"RelayStep";

DELETE FROM "checklist_items"
WHERE "step" = 'onboarding_gate'::"RelayStep";

COMMIT;

-- Backfill batchId into historical review_session_submitted activity events so
-- their notifications deep-link to the review session detail page instead of
-- falling back to the generic client page.
--
-- These events were written with reviewSessionId but no batchId. resolveHref
-- needs reviewSessionId + batchId to build the review-session link, so without
-- batchId they resolve to /clients/{id} (generic). New events carry batchId at
-- creation (src/server/actions/reviewSessions.ts). Derive the batch through
-- reviewSession -> magicLink -> batchId. Only touch rows missing batchId.
UPDATE "activity_events" AS ae
SET "payload" = jsonb_set(ae."payload", '{batchId}', to_jsonb(ml."batchId"))
FROM "review_sessions" AS rs
JOIN "magic_links" AS ml ON ml."id" = rs."magicLinkId"
WHERE ae."kind" = 'review_session_submitted'
  AND NOT (ae."payload" ? 'batchId')
  AND rs."id" = (ae."payload" ->> 'reviewSessionId');

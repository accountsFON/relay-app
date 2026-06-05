-- Adds real "addressed" state to ReviewItem so the review-session detail page
-- can reverse it (un-address). Backfills from the latest review_item_addressed
-- activity event per item, EXCEPT accept-path items (acceptedAsPostVersionId
-- not null) which stay addressed via that column.

BEGIN;

ALTER TABLE "review_items" ADD COLUMN "addressedAt" TIMESTAMP(3);
ALTER TABLE "review_items" ADD COLUMN "addressedBy" TEXT;

UPDATE "review_items" AS ri
SET "addressedAt" = sub."createdAt",
    "addressedBy" = sub."addressedBy"
FROM (
  SELECT DISTINCT ON (ae."payload"->>'reviewItemId')
    ae."payload"->>'reviewItemId' AS "reviewItemId",
    ae."createdAt"               AS "createdAt",
    ae."payload"->>'addressedBy' AS "addressedBy"
  FROM "activity_events" ae
  WHERE ae."kind" = 'review_item_addressed'
    AND ae."payload"->>'reviewItemId' IS NOT NULL
  ORDER BY ae."payload"->>'reviewItemId', ae."createdAt" DESC
) AS sub
WHERE ri."id" = sub."reviewItemId"
  AND ri."acceptedAsPostVersionId" IS NULL;

COMMIT;

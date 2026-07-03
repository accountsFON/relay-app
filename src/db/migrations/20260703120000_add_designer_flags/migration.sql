-- Route feedback to the designer: per-item flags the AM raises on client
-- feedback so the designer works a curated list. Additive, all nullable
-- except the FK owners. No data backfill (designers keep full read-only view).

BEGIN;

CREATE TABLE "designer_flags" (
  "id"           TEXT NOT NULL,
  "batchId"      TEXT NOT NULL,
  "postId"       TEXT NOT NULL,
  "threadId"     TEXT,
  "reviewItemId" TEXT,
  "note"         TEXT,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt"       TIMESTAMP(3),
  "doneById"     TEXT,
  CONSTRAINT "designer_flags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "designer_flags_batchId_idx" ON "designer_flags"("batchId");
CREATE INDEX "designer_flags_postId_idx" ON "designer_flags"("postId");
CREATE INDEX "designer_flags_threadId_idx" ON "designer_flags"("threadId");
CREATE INDEX "designer_flags_reviewItemId_idx" ON "designer_flags"("reviewItemId");

ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "post_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_reviewItemId_fkey"
  FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "designer_flags" ADD CONSTRAINT "designer_flags_doneById_fkey"
  FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

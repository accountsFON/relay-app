-- CreateEnum
CREATE TYPE "ReviewSessionStatus" AS ENUM ('in_progress', 'submitted', 'superseded');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('not_reviewed', 'approved', 'changes_requested', 'caption_edited');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'review_session_started';
ALTER TYPE "ActivityKind" ADD VALUE 'review_session_submitted';
ALTER TYPE "ActivityKind" ADD VALUE 'review_caption_edit_accepted';
ALTER TYPE "ActivityKind" ADD VALUE 'review_item_addressed';
ALTER TYPE "ActivityKind" ADD VALUE 'review_round_started';

-- AlterTable
ALTER TABLE "post_versions" ADD COLUMN     "editAuthorRole" TEXT,
ADD COLUMN     "editOrigin" TEXT,
ADD COLUMN     "parentVersionId" TEXT;

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" TEXT NOT NULL,
    "magicLinkId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "ReviewSessionStatus" NOT NULL DEFAULT 'in_progress',
    "round" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "submittedSummary" JSONB,

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_items" (
    "id" TEXT NOT NULL,
    "reviewSessionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL DEFAULT 'not_reviewed',
    "comment" TEXT,
    "suggestedCaption" TEXT,
    "acceptedAsPostVersionId" TEXT,
    "updatedSinceLastReview" BOOLEAN NOT NULL DEFAULT false,
    "lastReviewedVersionId" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_sessions_magicLinkId_round_idx" ON "review_sessions"("magicLinkId", "round");

-- CreateIndex
CREATE INDEX "review_sessions_reviewerId_idx" ON "review_sessions"("reviewerId");

-- CreateIndex
CREATE INDEX "review_items_postId_idx" ON "review_items"("postId");

-- CreateIndex
CREATE INDEX "review_items_decision_idx" ON "review_items"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "review_items_reviewSessionId_postId_key" ON "review_items"("reviewSessionId", "postId");

-- CreateIndex
CREATE INDEX "post_versions_parentVersionId_idx" ON "post_versions"("parentVersionId");

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "post_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_magicLinkId_fkey" FOREIGN KEY ("magicLinkId") REFERENCES "magic_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "magic_link_reviewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "review_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_acceptedAsPostVersionId_fkey" FOREIGN KEY ("acceptedAsPostVersionId") REFERENCES "post_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_lastReviewedVersionId_fkey" FOREIGN KEY ("lastReviewedVersionId") REFERENCES "post_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

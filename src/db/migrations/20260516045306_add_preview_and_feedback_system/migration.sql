-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('open', 'resolved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'post_thread_opened';
ALTER TYPE "ActivityKind" ADD VALUE 'post_thread_resolved';
ALTER TYPE "ActivityKind" ADD VALUE 'post_caption_ai_fixed';
ALTER TYPE "ActivityKind" ADD VALUE 'magic_link_created';
ALTER TYPE "ActivityKind" ADD VALUE 'magic_link_visited';

-- CreateTable
CREATE TABLE "post_threads" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'open',
    "imageX" DOUBLE PRECISION,
    "imageY" DOUBLE PRECISION,
    "captionFrom" INTEGER,
    "captionTo" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "reviewerToken" TEXT,

    CONSTRAINT "post_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "reviewerToken" TEXT,
    "reviewerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_links" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "defaultReviewerName" TEXT NOT NULL,
    "defaultReviewerEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVisitedAt" TIMESTAMP(3),

    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_link_reviewers" (
    "id" TEXT NOT NULL,
    "magicLinkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "sessionId" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_threads_postId_status_idx" ON "post_threads"("postId", "status");

-- CreateIndex
CREATE INDEX "post_threads_reviewerToken_idx" ON "post_threads"("reviewerToken");

-- CreateIndex
CREATE INDEX "post_comments_threadId_createdAt_idx" ON "post_comments"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "magic_links_tokenHash_key" ON "magic_links"("tokenHash");

-- CreateIndex
CREATE INDEX "magic_links_batchId_idx" ON "magic_links"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_reviewers_sessionId_key" ON "magic_link_reviewers"("sessionId");

-- CreateIndex
CREATE INDEX "magic_link_reviewers_magicLinkId_idx" ON "magic_link_reviewers"("magicLinkId");

-- AddForeignKey
ALTER TABLE "post_threads" ADD CONSTRAINT "post_threads_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_threads" ADD CONSTRAINT "post_threads_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_threads" ADD CONSTRAINT "post_threads_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "post_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_reviewers" ADD CONSTRAINT "magic_link_reviewers_magicLinkId_fkey" FOREIGN KEY ("magicLinkId") REFERENCES "magic_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

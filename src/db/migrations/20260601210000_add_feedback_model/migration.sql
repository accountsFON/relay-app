-- Phase 5 item 27, in app "Report a bug" channel.
-- New FeedbackSeverity enum + Feedback table. Strictly additive, no
-- existing rows touched. Weekly digest cron (sendFeedbackDigest, Mondays
-- 13:00 UTC) reads sentInDigestAt = null; submitFeedbackAction fires an
-- immediate admin email when severity = 'high' and sets sentUrgentAt.
--
-- Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentInDigestAt" TIMESTAMP(3),
    "sentUrgentAt" TIMESTAMP(3),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_sentInDigestAt_idx" ON "feedback"("sentInDigestAt");

-- CreateIndex
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

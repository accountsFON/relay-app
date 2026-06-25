-- Reply notifications: per-reviewer "AM replied" read marker, email cooldown,
-- and a new activity kind for client replies (AM bell).
ALTER TABLE "magic_link_reviewers" ADD COLUMN "repliesSeenAt" TIMESTAMP(3);
ALTER TABLE "magic_links" ADD COLUMN "replyEmailSentAt" TIMESTAMP(3);
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'post_comment_added';

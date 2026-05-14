-- CreateIndex
CREATE UNIQUE INDEX "posts_contentRunId_postDate_key" ON "posts"("contentRunId", "postDate");

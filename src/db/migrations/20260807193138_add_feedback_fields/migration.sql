-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "pageUrl" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;
-- CreateIndex
CREATE INDEX "feedback_organizationId_idx" ON "feedback"("organizationId");
-- CreateIndex
CREATE INDEX "feedback_resolvedAt_idx" ON "feedback"("resolvedAt");
-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

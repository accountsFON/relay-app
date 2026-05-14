-- AlterTable
ALTER TABLE "content_runs" ADD COLUMN     "targetBatchId" TEXT;

-- CreateIndex
CREATE INDEX "content_runs_targetBatchId_idx" ON "content_runs"("targetBatchId");

-- AddForeignKey
ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_targetBatchId_fkey" FOREIGN KEY ("targetBatchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

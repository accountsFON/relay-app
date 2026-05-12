-- CreateTable
CREATE TABLE "trash_audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "parentContext" JSONB NOT NULL DEFAULT '{}',
    "cascadeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trash_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trash_audit_logs_organizationId_idx" ON "trash_audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "trash_audit_logs_entityId_idx" ON "trash_audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "trash_audit_logs_action_idx" ON "trash_audit_logs"("action");

-- CreateIndex
CREATE INDEX "trash_audit_logs_createdAt_idx" ON "trash_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "trash_audit_logs" ADD CONSTRAINT "trash_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

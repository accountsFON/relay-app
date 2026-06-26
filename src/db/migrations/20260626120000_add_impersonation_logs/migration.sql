-- View-as (admin impersonation) audit trail: one row per start/stop.
CREATE TABLE "impersonation_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "realActorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impersonation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "impersonation_logs_organizationId_idx" ON "impersonation_logs"("organizationId");
CREATE INDEX "impersonation_logs_realActorId_idx" ON "impersonation_logs"("realActorId");
CREATE INDEX "impersonation_logs_targetUserId_idx" ON "impersonation_logs"("targetUserId");

ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_realActorId_fkey" FOREIGN KEY ("realActorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

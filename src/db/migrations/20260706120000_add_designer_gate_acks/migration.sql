-- Designer onboarding gate: per-relay acknowledgement row recording that a
-- designer has cleared the onboarding gate check for a given batch. Additive,
-- no data backfill needed (empty table is the correct starting state).

BEGIN;

CREATE TABLE "designer_gate_acks" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "batchId"        TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "designer_gate_acks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "designer_gate_acks_batchId_userId_key" ON "designer_gate_acks"("batchId", "userId");
CREATE INDEX "designer_gate_acks_organizationId_idx" ON "designer_gate_acks"("organizationId");

ALTER TABLE "designer_gate_acks" ADD CONSTRAINT "designer_gate_acks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_gate_acks" ADD CONSTRAINT "designer_gate_acks_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designer_gate_acks" ADD CONSTRAINT "designer_gate_acks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

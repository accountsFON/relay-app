-- Copy-step onboarding gate: per-relay acknowledgement row recording that an
-- AM (or admin) has cleared the copy-step onboarding gate for a given batch.
-- Additive, no data backfill needed (empty table is the correct starting state).

BEGIN;

CREATE TABLE "copy_gate_acks" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "batchId"        TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copy_gate_acks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "copy_gate_acks_batchId_userId_key" ON "copy_gate_acks"("batchId", "userId");
CREATE INDEX "copy_gate_acks_organizationId_idx" ON "copy_gate_acks"("organizationId");

ALTER TABLE "copy_gate_acks" ADD CONSTRAINT "copy_gate_acks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copy_gate_acks" ADD CONSTRAINT "copy_gate_acks_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copy_gate_acks" ADD CONSTRAINT "copy_gate_acks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

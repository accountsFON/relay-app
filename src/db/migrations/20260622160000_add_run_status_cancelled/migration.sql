-- Add the user-initiated cancellation terminal status to RunStatus.
-- Distinct from `failed` so a cancel renders neutrally (no error / Retry).
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'cancelled';

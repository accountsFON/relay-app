-- Add the two merged-step enum values. Old values (sent_to_client,
-- client_decision, ready_to_schedule, final_qa_schedule) are retained for
-- historical RelayEvent/ChecklistItem rows and are no longer routed to as a
-- current Batch.currentStep after the cutover script.
ALTER TYPE "RelayStep" ADD VALUE IF NOT EXISTS 'client_review';
ALTER TYPE "RelayStep" ADD VALUE IF NOT EXISTS 'scheduling';

import { RelayStep } from '@prisma/client'

/**
 * Whether a batch at this step should fire the completion celebration
 * (BatchCompletionLap).
 *
 * The celebration fires AFTER the final step is finished, i.e. once the batch
 * reaches the terminal `completed` state, NOT when it merely arrives at
 * `final_qa_schedule` (the last working step, where final QA + scheduling
 * still have to happen). Gating on `final_qa_schedule` celebrates too early;
 * keep this on `completed`.
 */
export function isRelayCelebrationStep(step: RelayStep): boolean {
  return step === RelayStep.completed
}

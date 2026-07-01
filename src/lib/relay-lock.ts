import { RelayStep } from '@prisma/client'

/**
 * A relay is "locked" once it reaches the terminal `completed` step: after
 * scheduling, its posts are shipped and must not be edited. The lock is tied to
 * the step (uniform for every viewer) and is permanent (no reopen). See
 * 2026-07-01-lock-completed-relay-design.md.
 */
export function isRelayLocked(step: RelayStep): boolean {
  return step === RelayStep.completed
}

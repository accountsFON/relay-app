import { RelayStep } from '@prisma/client'

/**
 * A relay is "locked" once it reaches the terminal `completed` step: after
 * scheduling, its posts are shipped and must not be edited. The lock is tied to
 * the step (uniform for every viewer) and is permanent (no reopen). See
 * 2026-07-01-lock-completed-relay-design.md.
 *
 * Temporary override: setting `RELAY_COMPLETED_LOCK_DISABLED=true` makes the
 * lock dormant everywhere at once (the server edit-guard + both page UIs, which
 * are the only callers and all run server-side). Completed relays then behave
 * like any other: no grayscale, live controls, edits allowed. Added 2026-08-12
 * to unblock pilot testing; remove the env var to restore the lock, no code
 * change needed. The env is read (not NEXT_PUBLIC) so it never leaks to the
 * client bundle; if this helper is ever imported client-side it safely falls
 * back to the normal lock.
 */
export function isRelayLocked(step: RelayStep): boolean {
  if (process.env.RELAY_COMPLETED_LOCK_DISABLED === 'true') return false
  return step === RelayStep.completed
}

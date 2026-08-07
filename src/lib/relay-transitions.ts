import { RelayStep } from '@prisma/client'

/**
 * Pure relay transition data (no db / server dependencies), safe to import
 * from client components. The server state machine
 * (`@/server/lib/relay-state-machine`) imports and re-exports these, and adds
 * the db-aware helpers on top. Client UI that needs the pipeline order (e.g.
 * the admin force-step dropdown) imports `LIVE_PIPELINE_STEPS` from here so it
 * never has to reach into `@/server`.
 */

export type TransitionDirection = 'forward' | 'send_back' | 'revision' | 'auto'

export interface LegalTransition {
  from: RelayStep
  to: RelayStep
  direction: TransitionDirection
}

export const LEGAL_TRANSITIONS: readonly LegalTransition[] = [
  // Copy Review is the first live step (onboarding_gate retired 2026-07-01):
  // no send-back target.
  { from: RelayStep.copy, to: RelayStep.in_design, direction: 'forward' },

  { from: RelayStep.in_design, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.in_design, to: RelayStep.copy, direction: 'send_back' },

  // Merge design steps (2026-06-26): Design Review is AM-held start to finish.
  // "Request changes" is now an in-step action (requestDesignChanges), not a
  // transition, so am_review_design has no send_back target and design_revisions
  // is retired (removed from both transition tables). It stays in RelayStep +
  // HOLDER_ROLE for historical rows only.
  // Pre-Client QA removed (P1 #13): Design Review advances straight to Client
  // Review; the final-QA once-over + send-link happen in a confirm modal on this
  // transition. am_qa_pre_client stays in the enum for historical rows only.
  { from: RelayStep.am_review_design, to: RelayStep.client_review, direction: 'forward' },

  // Client Review exits are driven by advanceFromClientReview (client submit)
  // or the auto-advance cron. Marked `auto` so passBaton accepts them when an
  // AM manually pushes the relay forward; advanceFromClientReview bypasses the
  // table entirely (see services/relay.ts).
  { from: RelayStep.client_review, to: RelayStep.scheduling, direction: 'auto' },
  { from: RelayStep.client_review, to: RelayStep.implementing_revisions, direction: 'auto' },
  { from: RelayStep.client_review, to: RelayStep.am_review_design, direction: 'send_back' },

  // Post Revision: re-review (back to client) or finish (to scheduling). Both
  // are `forward` so passBaton (which accepts only forward/auto) can traverse
  // them; the AM picks the destination from a two-way forward choice.
  { from: RelayStep.implementing_revisions, to: RelayStep.client_review, direction: 'forward' },
  { from: RelayStep.implementing_revisions, to: RelayStep.scheduling, direction: 'forward' },

  { from: RelayStep.scheduling, to: RelayStep.completed, direction: 'forward' },
  { from: RelayStep.scheduling, to: RelayStep.am_review_design, direction: 'send_back' },

  { from: RelayStep.completed, to: RelayStep.scheduling, direction: 'send_back' },
] as const

export const LEGAL_TRANSITIONS_NO_REVIEW: readonly LegalTransition[] = [
  // Copy Review is the first live step (onboarding_gate retired 2026-07-01):
  // no send-back target.
  { from: RelayStep.copy, to: RelayStep.in_design, direction: 'forward' },

  { from: RelayStep.in_design, to: RelayStep.am_review_design, direction: 'forward' },
  { from: RelayStep.in_design, to: RelayStep.copy, direction: 'send_back' },

  // Merge design steps (2026-06-26): see LEGAL_TRANSITIONS above. design_revisions
  // is retired here too; am_review_design's send_back is replaced by the in-step
  // "Request changes" action.
  // Pre-Client QA removed (P1 #13): Design Review advances straight to Scheduling.
  { from: RelayStep.am_review_design, to: RelayStep.scheduling, direction: 'forward' },

  { from: RelayStep.scheduling, to: RelayStep.completed, direction: 'forward' },
  { from: RelayStep.scheduling, to: RelayStep.am_review_design, direction: 'send_back' },

  { from: RelayStep.completed, to: RelayStep.scheduling, direction: 'send_back' },
] as const

/**
 * Ordered set of LIVE pipeline steps: every step that has at least one
 * outgoing transition in either track, so forcing a batch onto one never
 * strands it on a dead-end / retired step. DERIVED from the transition tables
 * (the single source of truth) rather than hand-maintained, because a hand
 * list has drifted out of sync across the 2026-06-22, 2026-06-26, and 2026-07
 * reworks (retired steps lingered, new live steps went missing). Order follows
 * first appearance as a `from` step, which is pipeline order. Currently:
 * copy -> in_design -> am_review_design -> client_review ->
 * implementing_revisions -> scheduling -> completed (`completed` qualifies via
 * its send_back edge to scheduling).
 *
 * Used by the admin force-step dropdown; keep any UI that offers "move a relay
 * to a step" pointed here so it can't drift again.
 */
export const LIVE_PIPELINE_STEPS: readonly RelayStep[] = (() => {
  const seen = new Set<RelayStep>()
  const ordered: RelayStep[] = []
  for (const t of [...LEGAL_TRANSITIONS, ...LEGAL_TRANSITIONS_NO_REVIEW]) {
    if (!seen.has(t.from)) {
      seen.add(t.from)
      ordered.push(t.from)
    }
  }
  return ordered
})()

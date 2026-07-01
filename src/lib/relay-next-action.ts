import { RelayStep } from '@prisma/client'
import type { UserRole } from '@/lib/types'
import { NECTR_CRM_URL } from '@/lib/nectr'

/**
 * The scheduling stage. Mirrors `SCHEDULING_STEPS` in
 * `src/components/batch/go-to-nectrcrm-button.tsx`: the 2026-06-22 rework
 * merged the old `ready_to_schedule` + `final_qa_schedule` into a single
 * `scheduling` step, but pre-rework batches still sit on the retired steps,
 * so the next-action map must treat all three as "scheduling".
 */
const SCHEDULING_STEPS: ReadonlySet<RelayStep> = new Set([
  RelayStep.scheduling,
  RelayStep.ready_to_schedule,
  RelayStep.final_qa_schedule,
])

export type NextActionTone = 'action' | 'waiting' | 'done'

export interface NextActionButton {
  label: string
  href: string
}

export interface NextAction {
  tone: NextActionTone
  title: string
  /** One short line of guidance. */
  detail?: string
  /** Primary off-page destination. Omitted for waiting/done + on-page steps. */
  button?: NextActionButton
  /** Optional second link (e.g. the designer's client-content folder). */
  secondaryButton?: NextActionButton
}

export interface NextActionInput {
  step: RelayStep
  subState: string | null
  /** Impersonation-aware viewer role (ctx.role). */
  viewerRole: UserRole
  /**
   * Viewer holds the relay / may act now. Accepted for call-site symmetry with
   * the page's existing canAct gate; the actor is derived from role + sub-state
   * per the design table, so this is not consulted directly.
   */
  isHolder: boolean
  clientId: string
  batchId: string
  /** True when a client review session has been submitted (client_review). */
  hasSubmittedReviewSession: boolean
  /** The latest submitted review session id, for the feedback deep link. */
  reviewSessionId?: string | null
  /** The client content folder, for the designer's content link. */
  assetsFolderUrl?: string | null
}

/**
 * Pure, fully unit-testable "what do I do next" map for the relay detail
 * page. No DB, no React: the page passes already-loaded values in and renders
 * the result via <NextActionBoard />.
 *
 * Role-aware: the actor for each step sees the action + button; everyone else
 * sees a muted "waiting on the holder" state with no button. The
 * `am_review_design` step flips actor on its sub-state (default = AM reviews;
 * `awaiting_design_revisions` = the designer reworks while the AM waits).
 * admin / platform owner follow the AM action (they may override the holder).
 */
export function nextActionForRelay(input: NextActionInput): NextAction {
  const {
    step,
    subState,
    viewerRole,
    clientId,
    batchId,
    hasSubmittedReviewSession,
    reviewSessionId,
    assetsFolderUrl,
  } = input

  const preview = `/clients/${clientId}/batches/${batchId}/preview`
  // admin viewing follows whichever AM action applies (they can act).
  const amViewer = viewerRole === 'account_manager' || viewerRole === 'admin'
  const designerViewer = viewerRole === 'designer'

  const waiting = (
    holderRole: string,
    title?: string,
    button?: NextActionButton,
  ): NextAction => ({
    tone: 'waiting',
    title: title ?? `Waiting on the ${holderRole}`,
    ...(button ? { button } : {}),
  })

  // Terminal: completed is a done note for everyone.
  if (step === RelayStep.completed) {
    return { tone: 'done', title: 'This relay is complete' }
  }

  // Scheduling (incl. the two retired steps): AM schedules the approved posts.
  if (SCHEDULING_STEPS.has(step)) {
    if (amViewer) {
      return {
        tone: 'action',
        title: 'Schedule the approved posts',
        detail: 'Upload the exported CSV to NectrCRM and schedule the run.',
        button: { label: 'Go to NectrCRM', href: NECTR_CRM_URL },
      }
    }
    return waiting('account manager')
  }

  switch (step) {
    case RelayStep.onboarding_gate:
      // On-page Generate; no off-page button.
      if (amViewer) {
        return {
          tone: 'action',
          title: 'Finish onboarding and generate content',
        }
      }
      return waiting('account manager')

    case RelayStep.copy:
      // On-page copy review; no off-page button.
      if (amViewer) {
        return { tone: 'action', title: 'Review the copy' }
      }
      return waiting('account manager')

    case RelayStep.in_design: {
      if (designerViewer) {
        const a: NextAction = {
          tone: 'action',
          title: 'Upload the designs',
          detail: 'Build the visuals, then upload them for AM review.',
        }
        if (assetsFolderUrl) {
          a.button = { label: 'Open client content', href: assetsFolderUrl }
        }
        return a
      }
      return waiting('designer')
    }

    case RelayStep.am_review_design: {
      if (subState === 'awaiting_design_revisions') {
        // Designer reworks in-step; the AM is the non-actor here.
        if (designerViewer) {
          const a: NextAction = {
            tone: 'action',
            title: 'Revise the designs',
            detail: 'Apply the requested changes, then re-submit for review.',
            button: { label: 'Open internal review', href: preview },
          }
          if (assetsFolderUrl) {
            a.secondaryButton = {
              label: 'Open client content',
              href: assetsFolderUrl,
            }
          }
          return a
        }
        // The AM (non-actor) waits, but can still open the internal review to
        // watch the designer's in-progress revisions.
        return waiting('designer', 'Waiting on design revisions', {
          label: 'Open internal review',
          href: preview,
        })
      }
      // Default sub-state: the AM reviews the uploaded designs.
      if (amViewer) {
        return {
          tone: 'action',
          title: 'Review the designs',
          detail: 'Approve the designs or request changes.',
          button: { label: 'Review designs', href: preview },
        }
      }
      return waiting('account manager')
    }

    case RelayStep.am_qa_pre_client:
      if (amViewer) {
        return {
          tone: 'action',
          title: 'Run final QA, then send the review link',
          detail: 'Do the final internal check, then send the client the review link.',
          button: { label: 'Open internal review', href: preview },
        }
      }
      return waiting('account manager')

    case RelayStep.sent_to_client:
    case RelayStep.client_decision:
    case RelayStep.client_review: {
      if (amViewer) {
        const a: NextAction = {
          tone: 'action',
          title: 'Awaiting client review',
          detail: 'The client is reviewing this relay.',
        }
        if (hasSubmittedReviewSession && reviewSessionId) {
          a.button = {
            label: 'View client feedback',
            href: `/clients/${clientId}/batches/${batchId}/review-sessions/${reviewSessionId}`,
          }
        }
        return a
      }
      return waiting('account manager')
    }

    case RelayStep.implementing_revisions:
    case RelayStep.revisions_complete: {
      if (amViewer) {
        const a: NextAction = {
          tone: 'action',
          title: "Apply the client's revisions",
          detail: 'Work through the requested changes, then continue the relay.',
        }
        if (hasSubmittedReviewSession && reviewSessionId) {
          a.button = {
            label: 'View client feedback',
            href: `/clients/${clientId}/batches/${batchId}/review-sessions/${reviewSessionId}`,
          }
        } else {
          a.button = { label: 'Open internal review', href: preview }
        }
        return a
      }
      return waiting('account manager')
    }

    // Retired design legs (kept for historical/in-flight batches). These are
    // designer-held in spirit; treat them like in_design.
    case RelayStep.designs_completed:
    case RelayStep.design_revisions: {
      if (designerViewer) {
        const a: NextAction = {
          tone: 'action',
          title: 'Upload the designs',
        }
        if (assetsFolderUrl) {
          a.button = { label: 'Open client content', href: assetsFolderUrl }
        }
        return a
      }
      return waiting('designer')
    }

    // The scheduling steps (scheduling / ready_to_schedule / final_qa_schedule)
    // and `completed` are handled before this switch, so they are narrowed out
    // of RelayStep here and need no case labels.
  }

  // Defensive fallback: any future RelayStep with no explicit case lands on a
  // neutral waiting state rather than throwing on the relay page.
  return waiting('account manager')
}

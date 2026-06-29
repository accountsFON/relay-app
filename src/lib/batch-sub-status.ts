import { RelayStep } from '@prisma/client'

export interface BatchForSubStatus {
  currentStep: RelayStep
  currentSubState: string | null
  createdAt: Date
}

export interface SubStatus {
  /** Short label for chip rendering on the batch card. */
  label: string
  /** UI tone hint. */
  tone: 'neutral' | 'progress' | 'attention' | 'success'
  /** Days the batch has been on the current step (rough). */
  daysHere: number
}

/**
 * Derive a per-batch sub-status chip for kanban cards. Pure function;
 * UI maps `tone` to color tokens.
 */
export function deriveSubStatus(batch: BatchForSubStatus): SubStatus {
  const daysHere = Math.max(
    0,
    Math.floor((Date.now() - batch.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  )

  switch (batch.currentStep) {
    case RelayStep.copy: {
      const sub = batch.currentSubState ?? 'generating'
      const map: Record<string, SubStatus['tone']> = {
        generating: 'progress',
        drafted: 'attention',
        approved: 'success',
      }
      return {
        label: humanizeSubState(sub),
        tone: map[sub] ?? 'neutral',
        daysHere,
      }
    }

    case RelayStep.implementing_revisions:
      return { label: 'Implementing revisions', tone: 'progress', daysHere }

    case RelayStep.am_review_design:
      // Merge design steps (2026-06-26): "Request changes" sets this sub-state
      // in-step (no baton handoff) while the designer reworks the visuals.
      if (batch.currentSubState === 'awaiting_design_revisions') {
        return { label: 'Awaiting design revisions', tone: 'attention', daysHere }
      }
      return { label: 'Ready for review', tone: 'attention', daysHere }

    case RelayStep.am_qa_pre_client:
      return { label: 'In pre-client QA', tone: 'progress', daysHere }

    case RelayStep.sent_to_client:
      return { label: 'Awaiting client open', tone: 'attention', daysHere }

    case RelayStep.client_decision:
      return { label: 'Client deciding', tone: 'attention', daysHere }

    case RelayStep.client_review:
      return { label: 'Client reviewing', tone: 'attention', daysHere }

    case RelayStep.designs_completed:
      return { label: 'Designer marked done', tone: 'success', daysHere }

    case RelayStep.design_revisions:
      return { label: 'Designer revising', tone: 'progress', daysHere }

    case RelayStep.in_design:
      return { label: 'Designing', tone: 'progress', daysHere }

    case RelayStep.ready_to_schedule:
      return { label: 'Approved for schedule', tone: 'success', daysHere }

    case RelayStep.revisions_complete:
      return { label: 'Revisions complete (router)', tone: 'attention', daysHere }

    case RelayStep.final_qa_schedule:
      return { label: 'Scheduling', tone: 'progress', daysHere }

    case RelayStep.scheduling:
      return { label: 'Scheduling', tone: 'progress', daysHere }

    case RelayStep.onboarding_gate:
      return { label: 'Awaiting onboarding', tone: 'attention', daysHere }

    case RelayStep.completed:
      return { label: 'Finished', tone: 'success', daysHere }
  }
}

/**
 * Map any RelayStep to the kanban column it belongs to in the AM view.
 * Per spec § UI Direction: AM 6 columns.
 */
export type AmKanbanColumn =
  | 'Copy'
  | 'Design'
  | 'Pre-Client QA'
  | 'With Client'
  | 'Revisions'
  | 'Schedule'

export function amKanbanColumn(step: RelayStep): AmKanbanColumn | null {
  switch (step) {
    case RelayStep.copy:
      return 'Copy'
    case RelayStep.in_design:
    case RelayStep.designs_completed:
    case RelayStep.am_review_design:
    case RelayStep.design_revisions:
      return 'Design'
    case RelayStep.am_qa_pre_client:
      return 'Pre-Client QA'
    case RelayStep.sent_to_client:
    case RelayStep.client_decision:
    case RelayStep.client_review:
      return 'With Client'
    case RelayStep.implementing_revisions:
    case RelayStep.revisions_complete:
      return 'Revisions'
    case RelayStep.ready_to_schedule:
    case RelayStep.final_qa_schedule:
    case RelayStep.scheduling:
      return 'Schedule'
    case RelayStep.onboarding_gate:
      return null
    case RelayStep.completed:
      // Completed batches surface on the dashboard Completed station, not in the legacy kanban.
      return null
  }
}

export type DesignerKanbanColumn = 'In Design' | 'Awaiting QA' | 'Revisions'

/**
 * Map a step (+ sub-state) to the designer kanban column.
 *
 * Merge design steps (2026-06-26): requested changes now live on
 * `am_review_design` with the `awaiting_design_revisions` sub-state (AM-held,
 * no baton handoff). To keep those visible to the designer, this returns the
 * "Revisions" column for that case — but stays `null` for `am_review_design` in
 * the default (AM-reviewing) sub-state, so plain AM-review batches do not leak
 * onto the designer board.
 */
export function designerKanbanColumn(
  step: RelayStep,
  subState: string | null,
): DesignerKanbanColumn | null {
  switch (step) {
    case RelayStep.in_design:
      return 'In Design'
    case RelayStep.designs_completed:
      return 'Awaiting QA'
    case RelayStep.design_revisions:
      return 'Revisions'
    case RelayStep.am_review_design:
      return subState === 'awaiting_design_revisions' ? 'Revisions' : null
    default:
      return null
  }
}

export type ClientKanbanColumn = 'Awaiting Your Approval' | 'In Production'

export function clientKanbanColumn(step: RelayStep): ClientKanbanColumn | null {
  switch (step) {
    case RelayStep.sent_to_client:
    case RelayStep.client_decision:
    case RelayStep.client_review:
      return 'Awaiting Your Approval'
    case RelayStep.copy:
    case RelayStep.in_design:
    case RelayStep.designs_completed:
    case RelayStep.am_review_design:
    case RelayStep.design_revisions:
    case RelayStep.am_qa_pre_client:
    case RelayStep.ready_to_schedule:
    case RelayStep.implementing_revisions:
    case RelayStep.revisions_complete:
    case RelayStep.final_qa_schedule:
    case RelayStep.scheduling:
      return 'In Production'
    case RelayStep.onboarding_gate:
      return null
    case RelayStep.completed:
      // Completed batches surface on the dashboard Completed station, not in the legacy kanban.
      return null
  }
}

function humanizeSubState(sub: string): string {
  return sub.charAt(0).toUpperCase() + sub.slice(1).replace(/_/g, ' ')
}

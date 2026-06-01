/**
 * Relay view types: denormalized shapes the UI components consume.
 *
 * Wraps the Prisma models with computed fields (daysOnCurrentStep) and
 * eager-loaded relations (holder) so the components don't need to know
 * how the page assembled the data.
 */
import type {
  Batch,
  ChecklistItem,
  RelayStep,
  RevisionItem,
} from '@prisma/client'

export interface BatchHolderView {
  id: string
  name: string
  avatarUrl?: string | null
}

/** Card / track / panel-friendly batch shape. Phase 3 producer is the page. */
export interface BatchSummary
  extends Pick<
    Batch,
    | 'id'
    | 'clientId'
    | 'label'
    | 'currentStep'
    | 'currentSubState'
    | 'currentRole'
    | 'scheduledAt'
    | 'createdAt'
    | 'clientReviewEnabled'
  > {
  holder: BatchHolderView
  /** Days the batch has held at currentStep. Computed by the page. */
  daysOnCurrentStep: number
}

/** Re-export Prisma's ChecklistItem for component consumption. */
export type { ChecklistItem }

/** Re-export Prisma's RevisionItem. */
export type { RevisionItem }

/** Send-back arc data for the relay-track Phase 3 SVG render. */
export interface SendBackArc {
  fromStep: RelayStep
  toStep: RelayStep
  reason: string
  at: Date
}

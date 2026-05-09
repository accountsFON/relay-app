/**
 * RelayTrack — hero horizontal timeline for the batch detail page.
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § UI Direction
 *
 * Behavior (V1):
 * - Horizontal stepper, role-color-coded nodes (Admin gray, AM blue, Designer purple, Client green).
 * - Animated TORCH icon on the current leg (lit, slight pulse).
 * - Send-back arcs: small downward arc above the track for each historical send_back event.
 * - Mobile (< md): flips to vertical stack with the same color coding.
 * - Client view: pass `audience="client"` to abstract to 3 nodes
 *   (Awaiting Your Approval -> In Production -> Done).
 *
 * Phase: shell now. Phase 3 fills in the SVG arcs + animation.
 * Schema dep: BatchSummary (placeholder), RelayEvent[] for arcs (Rails-owned).
 */
import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type BatchSummary,
  type RelayStep,
  STEP_LABEL,
  STEP_TO_ROLE,
  ROLE_COLOR,
} from './_placeholder-types'

const FULL_TRACK: RelayStep[] = [
  'onboarding_gate',
  'copy',
  'in_design',
  'designs_completed',
  'am_review_design',
  'design_revisions',
  'am_qa_pre_client',
  'sent_to_client',
  'client_decision',
  'ready_to_schedule',
  'implementing_revisions',
  'revisions_complete',
  'final_qa_schedule',
]

export interface SendBackArc {
  fromStep: RelayStep
  toStep: RelayStep
  reason: string
  at: Date
}

export interface RelayTrackProps {
  batch: BatchSummary
  /** Historical send-back events for arcs. Empty for V1 placeholder render. */
  sendBacks?: SendBackArc[]
  /** "internal" shows all 13 nodes; "client" shows the 3-node abstraction. */
  audience?: 'internal' | 'client'
  className?: string
}

export function RelayTrack({
  batch,
  sendBacks = [],
  audience = 'internal',
  className,
}: RelayTrackProps) {
  const steps = audience === 'client' ? CLIENT_TRACK_VIEW : FULL_TRACK
  const currentIndex = steps.indexOf(batch.currentStep)

  return (
    <div
      data-component="relay-track"
      data-audience={audience}
      className={cn(
        'relative w-full overflow-x-auto rounded-2xl bg-card p-4 md:p-6',
        className
      )}
    >
      {/* TODO Phase 3: render send-back arcs as SVG above this row */}
      <ol className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
        {steps.map((step, i) => {
          const role = STEP_TO_ROLE[step]
          const colors = ROLE_COLOR[role]
          const isCurrent = i === currentIndex
          const isPast = i < currentIndex

          return (
            <li
              key={step}
              className={cn(
                'flex items-center gap-2 md:flex-1 md:flex-col md:items-stretch',
                isPast && 'opacity-60'
              )}
            >
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  colors.bg,
                  colors.text,
                  isCurrent && `ring-2 ring-offset-2 ${colors.ring}`
                )}
              >
                {isCurrent ? (
                  // TODO Phase 3: animate this torch (pulse / soft glow)
                  <Flame className="size-4" aria-label="Current holder" />
                ) : (
                  <span className="text-[11px] font-semibold">{i + 1}</span>
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'truncate text-[12px] font-medium',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {STEP_LABEL[step]}
                </p>
                {isCurrent && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    Holder: {batch.holder.name}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {sendBacks.length > 0 && (
        // TODO Phase 3: replace stub list with SVG arcs above the track
        <p className="mt-3 text-[11px] text-muted-foreground">
          {sendBacks.length} send-back{sendBacks.length === 1 ? '' : 's'} on this batch
        </p>
      )}
    </div>
  )
}

/**
 * Client view abstracts the 13 internal steps to 3 user-facing buckets.
 * Mapping is rendered virtually — the underlying batch.currentStep is unchanged.
 * TODO Phase 3: implement bucket inference helper instead of this duplicate enum.
 */
const CLIENT_TRACK_VIEW: RelayStep[] = [
  'sent_to_client',
  'client_decision',
  'final_qa_schedule',
]

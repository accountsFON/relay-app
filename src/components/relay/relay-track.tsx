/**
 * RelayTrack: hero horizontal timeline for the batch detail page.
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § UI Direction
 *
 * Behavior (V1):
 * - Header row carries holder identity, step counter, and role chip; never per node.
 * - Track shows 13 nodes connected by a progress line. Past portion is ink, future is cream-80.
 * - Active node: ink-filled circle, white torch, larger. Past: cream-warm + check. Future: cream-80 + number.
 * - Role identity as small uppercase label below each step (not via stock pastel circle backgrounds).
 * - Horizontal scroll with fade-gradient mask on the right edge for overflow.
 * - Mobile (< md): vertical stack with left rail (line + circle) and right pane (label).
 * - Client view: pass `audience="client"` to abstract to 3 nodes
 *   (Awaiting Your Approval -> In Production -> Done).
 *
 * Schema dep: BatchSummary (placeholder), RelayEvent[] for arcs (Rails-owned).
 */
import { Flame, Check } from 'lucide-react'
import { RelayStep, RelayRole } from '@prisma/client'
import { cn } from '@/lib/utils'
import { STEP_LABEL, STEP_ROLE } from './labels'
import type { BatchSummary, SendBackArc } from './types'
import { ScrollCurrentIntoView } from './scroll-current-into-view'
import { RoleTooltip, StepTooltip } from './relay-tooltips'
import { relayTrackFor } from '@/lib/relay-track-shape'

const ROLE_LABEL: Record<RelayRole, string> = {
  [RelayRole.admin]: 'Admin',
  [RelayRole.am]: 'AM',
  [RelayRole.designer]: 'Designer',
  [RelayRole.client]: 'Client',
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
  const steps =
    audience === 'client'
      ? CLIENT_TRACK_VIEW
      : relayTrackFor(batch.clientReviewEnabled)
  const currentIndex = steps.indexOf(batch.currentStep)
  const totalSteps = steps.length

  const currentRole = STEP_ROLE[batch.currentStep]
  const currentLabel = STEP_LABEL[batch.currentStep]

  return (
    <section
      data-component="relay-track"
      data-audience={audience}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-card',
        className
      )}
    >
      <RelayTrackHeader
        batch={batch}
        currentRole={currentRole}
        currentLabel={currentLabel}
        currentIndex={currentIndex}
        totalSteps={totalSteps}
        sendBackCount={sendBacks.length}
      />

      <RelayTrackDesktop steps={steps} currentIndex={currentIndex} />
      <RelayTrackMobile steps={steps} currentIndex={currentIndex} />
      <ScrollCurrentIntoView />
    </section>
  )
}

function RelayTrackHeader({
  batch,
  currentRole,
  currentLabel,
  currentIndex,
  totalSteps,
  sendBackCount,
}: {
  batch: BatchSummary
  currentRole: RelayRole
  currentLabel: string
  currentIndex: number
  totalSteps: number
  sendBackCount: number
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4 md:px-6 md:py-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Step {currentIndex + 1} of {totalSteps}
        </p>
        <h2 className="mt-0.5 truncate text-[17px] font-semibold text-foreground sm:text-[19px]">
          {currentLabel}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-warm px-2.5 py-1 text-[11px] font-medium text-foreground">
          <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
          Holder: {batch.holder.name}
        </span>
        <RoleTooltip role={currentRole}>
          <span
            tabIndex={0}
            className="inline-flex items-center rounded-full bg-cream-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ROLE_LABEL[currentRole]}
          </span>
        </RoleTooltip>
        {batch.daysOnCurrentStep > 0 && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
              batch.daysOnCurrentStep > 5
                ? 'bg-destructive/10 text-destructive'
                : batch.daysOnCurrentStep > 2
                ? 'bg-cream-warm text-ink-80'
                : 'bg-cream-warm text-muted-foreground'
            )}
          >
            {batch.daysOnCurrentStep}d on step
          </span>
        )}
        {sendBackCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-cream-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {sendBackCount} send back{sendBackCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </header>
  )
}

/**
 * Desktop track: horizontal scroll with right-edge fade.
 * Each step has a minimum width so the line + label can breathe.
 * Connecting line is rendered behind the circles via absolute positioning per segment.
 *
 * Min width was tightened from 100px to 84px so all 13 steps fit within the
 * batch detail card at typical desktop widths (1024+) without horizontal
 * scroll, fixing the truncation of the last 2 steps that hid Final QA from
 * view. On narrower viewports, fade hints + scroll still apply.
 *
 * The ScrollCurrentIntoView client component below brings the active step
 * into view on mount when the user lands on a batch already past mid relay.
 */
function RelayTrackDesktop({
  steps,
  currentIndex,
}: {
  steps: RelayStep[]
  currentIndex: number
}) {
  return (
    <div className="relative hidden md:block">
      {/* Right edge fade hint when content overflows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-card to-transparent"
      />
      {/* Left edge fade hint when scrolled past the first step */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-card to-transparent"
      />
      <ol
        data-relay-track
        className="flex items-start gap-0 overflow-x-auto px-2 py-6 scroll-smooth"
      >
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex
          const isPast = i < currentIndex
          const isLast = i === steps.length - 1
          return (
            <li
              key={step}
              data-testid="relay-track-node"
              data-current={isCurrent || undefined}
              className="flex min-w-[84px] flex-col items-center first:pl-3 last:pr-3"
            >
              <div className="relative flex w-full items-center">
                {/* line segment to the right of this circle (skipped on last) */}
                {!isLast && (
                  <div
                    aria-hidden
                    className={cn(
                      'absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2',
                      i < currentIndex ? 'bg-foreground' : 'bg-cream-80'
                    )}
                  />
                )}
                <div className="relative z-10 mx-auto">
                  <StepTooltip step={step}>
                    <span
                      tabIndex={0}
                      className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RelayNodeCircle index={i} isCurrent={isCurrent} isPast={isPast} />
                    </span>
                  </StepTooltip>
                </div>
              </div>
              <RelayNodeLabel step={step} isCurrent={isCurrent} isPast={isPast} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * Mobile track: vertical stack. Left rail = connecting line + circle, right pane = label.
 * Designed for narrow viewports; up to 13 rows is acceptable on a scrollable mobile screen.
 */
function RelayTrackMobile({
  steps,
  currentIndex,
}: {
  steps: RelayStep[]
  currentIndex: number
}) {
  return (
    <ol className="flex flex-col md:hidden">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex
        const isPast = i < currentIndex
        const isFirst = i === 0
        const isLast = i === steps.length - 1
        return (
          <li
            key={step}
            data-testid="relay-track-node"
            className="flex items-stretch gap-3 px-5 first:pt-5 last:pb-5"
          >
            <div className="relative flex w-8 flex-col items-center">
              {/* line above circle (skipped on first) */}
              <div
                aria-hidden
                className={cn(
                  'w-px flex-1',
                  isFirst ? 'invisible' : i <= currentIndex ? 'bg-foreground' : 'bg-cream-80'
                )}
              />
              <div className="my-1">
                <RelayNodeCircle index={i} isCurrent={isCurrent} isPast={isPast} />
              </div>
              {/* line below circle (skipped on last) */}
              <div
                aria-hidden
                className={cn(
                  'w-px flex-1',
                  isLast ? 'invisible' : i < currentIndex ? 'bg-foreground' : 'bg-cream-80'
                )}
              />
            </div>
            <div className="flex-1 py-3">
              <p
                className={cn(
                  'text-[14px] font-medium',
                  isCurrent
                    ? 'text-foreground'
                    : isPast
                    ? 'text-ink-50'
                    : 'text-muted-foreground'
                )}
              >
                {STEP_LABEL[step]}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {ROLE_LABEL[STEP_ROLE[step]]}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function RelayNodeCircle({
  index,
  isCurrent,
  isPast,
}: {
  index: number
  isCurrent: boolean
  isPast: boolean
}) {
  if (isCurrent) {
    return (
      <div
        className="flex size-10 items-center justify-center rounded-full bg-foreground text-cream shadow-[0_0_0_4px_var(--card),0_0_0_5px_var(--ink)] transition-all"
        aria-current="step"
        aria-label="Current step"
      >
        <Flame className="size-4" />
      </div>
    )
  }
  if (isPast) {
    return (
      <div
        className="flex size-8 items-center justify-center rounded-full bg-cream-warm text-foreground transition-colors"
        aria-label="Completed step"
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </div>
    )
  }
  return (
    <div
      className="flex size-8 items-center justify-center rounded-full bg-cream-80 text-ink-50 transition-colors"
      aria-label={`Step ${index + 1}, not yet started`}
    >
      <span className="text-[11px] font-semibold tabular-nums">{index + 1}</span>
    </div>
  )
}

function RelayNodeLabel({
  step,
  isCurrent,
  isPast,
}: {
  step: RelayStep
  isCurrent: boolean
  isPast: boolean
}) {
  return (
    <div className="mt-3 w-full text-center">
      <p
        className={cn(
          'truncate text-[12px] font-medium leading-tight',
          isCurrent
            ? 'text-foreground'
            : isPast
            ? 'text-ink-50'
            : 'text-muted-foreground'
        )}
      >
        {STEP_LABEL[step]}
      </p>
      <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {ROLE_LABEL[STEP_ROLE[step]]}
      </p>
    </div>
  )
}

/**
 * Client view abstracts the 13 internal steps to 3 user-facing buckets.
 * Mapping is rendered virtually; the underlying batch.currentStep is unchanged.
 */
const CLIENT_TRACK_VIEW: RelayStep[] = [
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.final_qa_schedule,
]

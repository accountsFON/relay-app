/**
 * DashboardRelayTrack: horizontal relay race visualization for the dashboard.
 *
 * Replaces the old vertical kanban board. Each RelayStep is a station along a
 * horizontal track; each in-flight relay sits as a runner card under the
 * station where it is currently waiting. Stations are arranged left to right
 * from onboarding through final QA so the dashboard reads as a single sweep.
 *
 * Naming: this file deliberately uses "DashboardRelayTrack" to avoid
 * colliding with the existing RelayTrack component in relay-track.tsx, which
 * is the per-batch progress timeline rendered on the batch detail page. The
 * two concepts share the relay-race metaphor but show very different data.
 *
 * V1 is visual only. Cards navigate to the relay detail page on click;
 * drag-and-drop arrives in a follow up PR.
 */
import { cn } from '@/lib/utils'
import { relayStepLabel } from '@/lib/relay-step-labels'
import { EmptyState } from '@/components/ui/empty-state'
import type { RelayStep } from '@prisma/client'
import {
  RelayRunnerCard,
  type RunnerRelay,
} from '@/components/relay/relay-runner-card'
import { StepTooltip } from '@/components/relay/relay-tooltips'

export interface DashboardRelayTrackStation {
  step: RelayStep
  relays: RunnerRelay[]
}

export interface DashboardRelayTrackProps {
  /** Ordered left to right. The page decides which steps to surface. */
  stations: DashboardRelayTrackStation[]
  /** Viewer role drives messaging only. Filtering happens at the page. */
  viewerRole: 'am' | 'designer' | 'admin'
  /** Optional override for "now" so tests can pin the recently passed window. */
  now?: Date
  className?: string
}

export function DashboardRelayTrack({
  stations,
  viewerRole,
  now,
  className,
}: DashboardRelayTrackProps) {
  const totalRelays = stations.reduce((acc, s) => acc + s.relays.length, 0)

  if (totalRelays === 0) {
    return (
      <EmptyState
        title="No relays on the track."
        description={
          viewerRole === 'designer'
            ? 'When an AM passes a relay to design, it lines up here.'
            : 'Start one from a client profile and watch it move across the track.'
        }
        className={className}
      />
    )
  }

  return (
    <div
      data-component="dashboard-relay-track"
      className={cn('w-full', className)}
    >
      {/* Desktop: horizontal scrollable track */}
      <div className="relative hidden md:block">
        <div
          role="list"
          aria-label="Relay track"
          className="flex items-start gap-3 overflow-x-auto pb-3"
          style={{
            scrollbarColor: 'var(--ink-80) transparent',
            scrollbarWidth: 'thin',
          }}
        >
          {stations.map((station) => (
            <DesktopStation key={station.step} station={station} now={now} />
          ))}
        </div>
      </div>

      {/* Mobile: vertical stack, one row per station */}
      <ol className="flex flex-col gap-3 md:hidden">
        {stations.map((station) => (
          <MobileStation key={station.step} station={station} now={now} />
        ))}
      </ol>
    </div>
  )
}

function DesktopStation({
  station,
  now,
}: {
  station: DashboardRelayTrackStation
  now?: Date
}) {
  const hasRelays = station.relays.length > 0
  const hasRecent = station.relays.some((r) => isRecentlyPassed(r, now))

  return (
    <div
      role="listitem"
      data-step={station.step}
      data-active={hasRecent ? 'true' : undefined}
      className={cn(
        'flex w-[200px] shrink-0 flex-col rounded-lg bg-cream-warm/40 p-3',
        hasRecent && 'ring-1 ring-[color:var(--orange)]/50 bg-cream-warm/60'
      )}
    >
      <StationHeader
        step={station.step}
        count={station.relays.length}
        recent={hasRecent}
      />
      <div className="mt-2 flex flex-col gap-1.5">
        {hasRelays ? (
          station.relays.map((relay) => (
            <RelayRunnerCard key={relay.id} relay={relay} now={now} />
          ))
        ) : (
          <p className="px-1 py-1 text-[12px] italic text-muted-foreground">
            empty
          </p>
        )}
      </div>
    </div>
  )
}

function MobileStation({
  station,
  now,
}: {
  station: DashboardRelayTrackStation
  now?: Date
}) {
  const hasRelays = station.relays.length > 0
  const hasRecent = station.relays.some((r) => isRecentlyPassed(r, now))

  return (
    <li
      data-step={station.step}
      data-active={hasRecent ? 'true' : undefined}
      className={cn(
        'rounded-md bg-cream-warm/40 p-2.5',
        hasRecent && 'ring-1 ring-[color:var(--orange)]/50'
      )}
    >
      <StationHeader
        step={station.step}
        count={station.relays.length}
        recent={hasRecent}
      />
      <div className="mt-2 flex flex-col gap-1.5">
        {hasRelays ? (
          station.relays.map((relay) => (
            <RelayRunnerCard key={relay.id} relay={relay} now={now} />
          ))
        ) : (
          <p className="px-1 py-1 text-[11px] italic text-muted-foreground">
            no relays here
          </p>
        )}
      </div>
    </li>
  )
}

function StationHeader({
  step,
  count,
  recent,
}: {
  step: RelayStep
  count: number
  recent: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 px-1">
      <StepTooltip step={step}>
        <h3
          tabIndex={0}
          className={cn(
            'truncate rounded text-[12px] font-semibold uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            recent ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {relayStepLabel(step)}
        </h3>
      </StepTooltip>
      <span
        className={cn(
          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums',
          recent
            ? 'bg-[color:var(--orange)]/20 text-foreground'
            : 'bg-cream-80 text-ink-80'
        )}
        aria-label={`${count} ${count === 1 ? 'relay' : 'relays'} at this step`}
      >
        {count}
      </span>
    </div>
  )
}

function isRecentlyPassed(relay: RunnerRelay, now?: Date): boolean {
  if (!relay.lastTransitionAt) return false
  const ref = (now ?? new Date()).getTime()
  return ref - new Date(relay.lastTransitionAt).getTime() < 24 * 60 * 60 * 1000
}

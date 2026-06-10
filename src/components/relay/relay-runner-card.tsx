'use client'

/**
 * RelayRunnerCard: a single relay rendered as a runner on the dashboard
 * relay track. Compact card showing the client, the period, who is currently
 * holding the baton, and how long the relay has sat at the current step.
 *
 * Recently passed relays (state transition within the last 24 hours) get a
 * subtle baton handoff hint so it is easy to see motion across the track.
 *
 * Sibling: dashboard-relay-track.tsx (the strip that hosts these cards).
 * Sibling: relay-track.tsx (the per-batch progress timeline, a different
 * concept used on the batch detail page).
 */
import { useContext } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BrandCheckbox } from '@/components/ui/brand-checkbox'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/initials'
import { SelectModeContext } from '@/components/relay/dashboard-select-mode'

export interface RunnerHolder {
  id: string
  name: string
  avatarUrl?: string | null
}

export interface RunnerRelay {
  id: string
  clientId: string
  clientName: string
  /** Human-facing relay period, e.g. "May 2026". Pulled from batch.label. */
  label: string
  /** Days the relay has been on its current step. */
  daysOnStep: number
  /** Current holder of the baton. */
  holder: RunnerHolder
  /** Most recent step transition timestamp, used to flag recently passed relays. */
  lastTransitionAt: Date | null
}

export interface RelayRunnerCardProps {
  relay: RunnerRelay
  /** Override "now" for tests so the 24h window is deterministic. */
  now?: Date
  /** When true, render a checkbox in the upper-left and disable navigation on card-body click. */
  selectable?: boolean
  /** Whether this card is currently selected. */
  selected?: boolean
  /** Fired when the checkbox toggles. */
  onToggleSelect?: (id: string) => void
}

export function RelayRunnerCard({
  relay,
  now,
  selectable: selectableProp,
  selected: selectedProp,
  onToggleSelect: onToggleSelectProp,
}: RelayRunnerCardProps) {
  const router = useRouter()
  const href = `/clients/${relay.clientId}/batches/${relay.id}`

  // When no explicit selectable prop, fall back to the DashboardSelectMode
  // context if available. Lets the dashboard turn every card into a select
  // target with a single provider wrap.
  const ctx = useContext(SelectModeContext)
  const selectable = selectableProp ?? ctx?.isSelectMode ?? false
  const selected = selectedProp ?? ctx?.selectedIds.has(relay.id) ?? false
  const onToggleSelect = onToggleSelectProp ?? ctx?.toggleSelect

  const reference = (now ?? new Date()).getTime()
  const recentlyPassed =
    relay.lastTransitionAt != null &&
    reference - new Date(relay.lastTransitionAt).getTime() <
      24 * 60 * 60 * 1000

  function navigate() {
    if (selectable) {
      onToggleSelect?.(relay.id)
      return
    }
    router.push(href)
  }

  return (
    <div
      role={selectable ? undefined : 'link'}
      tabIndex={selectable ? -1 : 0}
      aria-label={`Open relay ${relay.clientName} ${relay.label}`}
      data-recent={recentlyPassed ? 'true' : undefined}
      onClick={navigate}
      onKeyDown={(e) => {
        if (selectable) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
      className={cn(
        'relative block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left cursor-pointer transition-colors',
        'hover:bg-neutral-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        recentlyPassed && 'ring-1 ring-blue-300',
        selectable && selected && 'ring-2 ring-foreground'
      )}
    >
      {selectable && (
        <span
          className="absolute top-1.5 left-1.5 z-10"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <BrandCheckbox
            checked={selected}
            onChange={() => onToggleSelect?.(relay.id)}
            aria-label={`Select ${relay.clientName} ${relay.label}`}
            className="size-3.5"
          />
        </span>
      )}
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[13px] font-medium text-foreground truncate">
          {relay.clientName}
        </p>
        {recentlyPassed && (
          <span
            title="Baton just passed"
            aria-label="Baton just passed"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-100 p-0.5 text-blue-500"
          >
            <Repeat className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground truncate">
        {relay.label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar size="sm" title={relay.holder.name} className="size-6">
            {relay.holder.avatarUrl && (
              <AvatarImage src={relay.holder.avatarUrl} />
            )}
            <AvatarFallback className="text-[10px]">
              {initials(relay.holder.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] text-muted-foreground">
            {relay.holder.name}
          </span>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {relay.daysOnStep}d
        </span>
      </div>
    </div>
  )
}


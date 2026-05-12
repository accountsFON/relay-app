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
import { useRouter } from 'next/navigation'
import { Repeat } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

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
}

export function RelayRunnerCard({ relay, now }: RelayRunnerCardProps) {
  const router = useRouter()
  const href = `/clients/${relay.clientId}/batches/${relay.id}`

  const reference = (now ?? new Date()).getTime()
  const recentlyPassed =
    relay.lastTransitionAt != null &&
    reference - new Date(relay.lastTransitionAt).getTime() <
      24 * 60 * 60 * 1000

  function navigate() {
    router.push(href)
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open relay ${relay.clientName} ${relay.label}`}
      data-recent={recentlyPassed ? 'true' : undefined}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
      className={cn(
        'block w-full rounded-md border border-border bg-background px-2.5 py-2 text-left cursor-pointer transition-colors',
        'hover:bg-cream-warm/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        recentlyPassed && 'ring-1 ring-[var(--orange)]/60'
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[12px] font-medium text-foreground truncate">
          {relay.clientName}
        </p>
        {recentlyPassed && (
          <span
            title="Baton just passed"
            aria-label="Baton just passed"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[color:var(--orange)]/15 p-0.5 text-[color:var(--orange)]"
          >
            <Repeat className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground truncate">
        {relay.label}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <Avatar size="sm" title={relay.holder.name} className="size-5">
            {relay.holder.avatarUrl && (
              <AvatarImage src={relay.holder.avatarUrl} />
            )}
            <AvatarFallback className="text-[9px]">
              {initials(relay.holder.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[10px] text-muted-foreground">
            {relay.holder.name}
          </span>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {relay.daysOnStep}d
        </span>
      </div>
    </div>
  )
}

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

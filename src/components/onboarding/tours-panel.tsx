'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'
import { useTourController } from '@/components/onboarding/tour-provider'
import { listToursForRole } from '@/components/onboarding/tour-registry'
import type { UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

export type ToursPanelProps = {
  role: UserRole
  className?: string
}

/**
 * Settings panel listing every onboarding tour available to the user's
 * role, each with a Replay button. Replay routes to the tour's home path
 * (so its anchors are present) and then starts it via the controller.
 */
export function ToursPanel({ role, className }: ToursPanelProps) {
  const router = useRouter()
  const { start } = useTourController()
  const tours = listToursForRole(role)

  const replay = useCallback(
    (tourId: string, homePath: string) => {
      router.push(homePath)
      start(tourId)
    },
    [router, start],
  )

  if (tours.length === 0) return null

  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {tours.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-2"
        >
          <span className="text-sm font-medium text-foreground">{t.labelForRole(role)}</span>
          <button
            type="button"
            data-testid={`tour-replay-${t.id}`}
            onClick={() => t.homePath && replay(t.id, t.homePath)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-neutral-50"
          >
            <Play aria-hidden className="size-3.5" />
            Replay
          </button>
        </li>
      ))}
    </ul>
  )
}

'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import { useTourController } from '@/components/onboarding/tour-provider'
import { listToursForRole } from '@/components/onboarding/tour-registry'
import type { UserRole } from '@/lib/types'

export type TipsMenuProps = {
  role: UserRole
}

/**
 * Sidebar "Tips" launcher. Sits below Settings and above Report. Toggles an
 * inline list of the role's walkthroughs (role-labeled, e.g. "Account
 * Manager Walkthrough"); picking one routes to its home path and starts it
 * via the tour controller. Hidden entirely for the client role (no internal
 * tours).
 */
export function TipsMenu({ role }: TipsMenuProps) {
  const router = useRouter()
  const { start } = useTourController()
  const [open, setOpen] = useState(false)
  const tours = listToursForRole(role)

  const replay = useCallback(
    (tourId: string, homePath: string) => {
      setOpen(false)
      router.push(homePath)
      start(tourId)
    },
    [router, start],
  )

  if (tours.length === 0) return null

  return (
    <div>
      <button
        type="button"
        data-testid="tips-button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-neutral-100"
      >
        <Lightbulb aria-hidden className="size-4 text-muted-foreground" />
        <span>Tips</span>
      </button>
      {open && (
        <ul data-testid="tips-menu" className="mt-1 space-y-1 pl-9 pr-1">
          {tours.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                data-testid={`tips-tour-${t.id}`}
                onClick={() => t.homePath && replay(t.id, t.homePath)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-neutral-100"
              >
                {t.labelForRole(role)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

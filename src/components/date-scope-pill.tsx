'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Calendar, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  dateScopeLabel,
  listDateScopePresets,
  parseDateScope,
  serializeDateScope,
  resolveDateScope,
  type DateScopePreset,
} from '@/lib/date-scope'
import { cn } from '@/lib/utils'

/**
 * Global date scope selector, desktop top bar pill.
 * Reads / writes URL search params (`scope`, `from`, `to`).
 * Spec: projects/relay-app/2026-05-09-future-features-exploration.md § 1.
 */
export function DateScopePill() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const scope = parseDateScope(searchParams)
  const presets = listDateScopePresets()

  const setPreset = (preset: DateScopePreset) => {
    const next = resolveDateScope({ preset })
    const params = new URLSearchParams(searchParams)
    // Wipe scope-related params first, then set new ones.
    params.delete('scope')
    params.delete('from')
    params.delete('to')
    const serialized = serializeDateScope(next)
    for (const [key, value] of Object.entries(serialized)) {
      params.set(key, value)
    }
    const qs = params.toString()
    // Direct router.push (no startTransition): the menu item unmounts
    // synchronously after onSelect, which cancels the suspended transition
    // before the navigation commits. Without the wrapper the navigation
    // commits cleanly even though the menu tears down.
    // scroll:false keeps the user's scroll position when only the filter
    // changes. Without it Next.js scrolls to top on every URL update.
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
        aria-label={`Date scope: ${dateScopeLabel(scope)}`}
      >
        <Calendar className="h-4 w-4 text-neutral-500" />
        <span>{dateScopeLabel(scope)}</span>
        <ChevronDown className="h-4 w-4 text-neutral-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {presets.map(({ preset, label }) => {
          if (preset === 'custom') return null
          return (
            <DropdownMenuItem
              key={preset}
              onClick={() => setPreset(preset)}
              className={cn(
                scope.preset === preset && 'bg-cream-warm font-medium',
              )}
            >
              {label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client'

import { useTransition } from 'react'
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
 * Global date scope selector — desktop top bar pill.
 * Reads/writes URL search params (`scope`, `from`, `to`).
 * Spec: projects/relay-app/2026-05-09-future-features-exploration.md § 1.
 */
export function DateScopePill() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

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
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-cream-warm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
          isPending && 'opacity-60',
        )}
        aria-label={`Date scope: ${dateScopeLabel(scope)}`}
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{dateScopeLabel(scope)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {presets.map(({ preset, label }) => {
          if (preset === 'custom') return null
          return (
            <DropdownMenuItem
              key={preset}
              onSelect={() => setPreset(preset)}
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

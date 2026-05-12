'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { INTENT_PRIORITY, stepLabel } from '@/components/relay/in-flight-runs-utils'

export function InFlightRunsPill() {
  const { runs } = useInFlightRuns()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (runs.length === 0) return null

  const sorted = [...runs].sort((a, b) => {
    const p = INTENT_PRIORITY[a.intent] - INTENT_PRIORITY[b.intent]
    if (p !== 0) return p
    return a.startedAt.localeCompare(b.startedAt)
  })

  const label = runs.length === 1 ? '1 run' : `${runs.length} runs`

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="default"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-controls="inflight-runs-popover"
        className="gap-1.5"
      >
        <Sparkles className="size-4" />
        <span>{label}</span>
      </Button>
      {open && (
        <div
          id="inflight-runs-popover"
          role="region"
          aria-label="In-flight runs"
          className="absolute right-0 top-full mt-2 w-[360px] rounded-xl border border-border bg-card shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[14px] font-semibold">{label} in flight</p>
          </div>
          <ul className="py-2 max-h-[400px] overflow-auto">
            {sorted.map((run) => (
              <li key={run.id} data-testid="inflight-row" className="px-4 py-2 text-[13px]">
                <p className="font-medium text-foreground">{run.clientName}</p>
                <p className="text-muted-foreground">{stepLabel(run)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

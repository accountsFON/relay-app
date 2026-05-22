'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { INTENT_PRIORITY } from '@/components/relay/in-flight-runs-utils'
import { RunProgressLine } from '@/components/relay/run-progress-line'

export function InFlightRunsPill() {
  const { runs } = useInFlightRuns()
  const [open, setOpen] = useState(false)
  const [clickedAcknowledged, setClickedAcknowledged] = useState<Set<string>>(new Set())
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

  // Failed runs were absorbed into the notification bell in Phase 1, and
  // listInFlightRuns no longer returns them. The intent='failed' filter
  // is kept as a defensive guard so the pill stays correct if a future
  // provider change re-introduces failed rows.
  const sorted = [...runs]
    .filter((r) => r.intent !== 'failed')
    .filter((r) => !(r.intent === 'awaiting_choice' && clickedAcknowledged.has(r.id)))
    .sort((a, b) => {
      const p = INTENT_PRIORITY[a.intent] - INTENT_PRIORITY[b.intent]
      if (p !== 0) return p
      return a.startedAt.localeCompare(b.startedAt)
    })

  if (sorted.length === 0) return null

  const label = sorted.length === 1 ? '1 run' : `${sorted.length} runs`

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
            {sorted.map((run) => {
              const rowBody = (
                <>
                  <p className="font-medium text-foreground">{run.clientName}</p>
                  <div className="text-muted-foreground truncate">
                    <RunProgressLine run={run} />
                  </div>
                </>
              )
              return (
                <li key={run.id} data-testid="inflight-row" className="text-[13px]">
                  <Link
                    href={`/clients/${run.clientId}`}
                    onClick={() => {
                      if (run.intent === 'awaiting_choice') {
                        setClickedAcknowledged((prev) => {
                          const next = new Set(prev)
                          next.add(run.id)
                          return next
                        })
                      }
                      setOpen(false)
                    }}
                    className="block px-4 py-2 hover:bg-cream-warm/60 transition-colors"
                  >
                    {rowBody}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

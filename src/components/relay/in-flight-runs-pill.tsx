'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { INTENT_PRIORITY } from '@/components/relay/in-flight-runs-utils'
import { RunProgressLine } from '@/components/relay/run-progress-line'
import { retryFailedRunAction, acknowledgeFailedRunAction } from '@/server/actions/in-flight-runs'

function FailedRunActions({ runId }: { runId: string }) {
  const { refresh } = useInFlightRuns()
  const [pending, setPending] = useState<'retry' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRetry = async () => {
    setPending('retry')
    setError(null)
    try {
      await retryFailedRunAction(runId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed')
      setPending(null)
    }
    // On success, the run drops + a new run appears; component unmounts. No setPending(null) needed.
  }

  const handleDismiss = async () => {
    setPending('dismiss')
    setError(null)
    try {
      await acknowledgeFailedRunAction(runId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed')
      setPending(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={handleRetry}
          disabled={pending !== null}
          className="text-[12px] text-foreground hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {pending === 'retry' ? 'Retrying…' : 'Retry'}
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={handleDismiss}
          disabled={pending !== null}
          className="text-[12px] text-muted-foreground hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
    </>
  )
}

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

  const sorted = [...runs]
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
              const isFailed = run.intent === 'failed'
              const rowBody = (
                <>
                  <p className="font-medium text-foreground">{run.clientName}</p>
                  <div
                    className={`text-muted-foreground ${isFailed ? '' : 'truncate'}`}
                    title={isFailed && run.errorMessage ? `Failed: ${run.errorMessage}` : undefined}
                  >
                    <RunProgressLine run={run} />
                  </div>
                </>
              )
              return (
                <li key={run.id} data-testid="inflight-row" className="text-[13px]">
                  {isFailed ? (
                    <div className="px-4 py-2">
                      {rowBody}
                      <FailedRunActions runId={run.id} />
                    </div>
                  ) : (
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
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

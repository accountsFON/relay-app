'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { RunProgressLine } from '@/components/relay/run-progress-line'
import { formatMonthYear } from '@/lib/batch-target-month'
import { cancelGenerationAction } from '@/server/actions/in-flight-runs'

export function InFlightBanner({ clientId }: { clientId: string }) {
  const { runs, refresh } = useInFlightRuns()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const matching = runs.filter((r) => r.clientId === clientId)
  if (matching.length === 0) return null

  const headline =
    matching.length === 1
      ? 'Generation in flight'
      : `${matching.length} generations in flight`

  async function onCancel(runId: string) {
    if (!window.confirm('Cancel generation? This stops the run and discards its progress.')) {
      return
    }
    setCancellingId(runId)
    try {
      await cancelGenerationAction(runId)
      await refresh()
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <Card className="bg-neutral-100 border-border" role="region" aria-label={headline}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-foreground" />
          <p className="text-[14px] font-semibold">{headline}</p>
        </div>
        <ul className="space-y-2">
          {matching.map((run) => (
            <li
              key={run.id}
              data-testid="banner-row"
              className="flex items-center justify-between gap-3 text-[13px]"
            >
              <span className="min-w-0">
                <span className="font-medium text-foreground">{formatMonthYear(run.targetMonth)}</span>
                <span className="text-muted-foreground"> · </span>
                <RunProgressLine run={run} />
              </span>
              {run.intent === 'active' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Cancel generation for ${formatMonthYear(run.targetMonth)}`}
                  disabled={cancellingId === run.id}
                  onClick={() => onCancel(run.id)}
                >
                  {cancellingId === run.id ? 'Cancelling…' : 'Cancel'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

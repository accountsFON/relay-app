'use client'

import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { stepLabel } from '@/components/relay/in-flight-runs-utils'
import { formatMonthYear } from '@/lib/batch-target-month'

export function InFlightBanner({ clientId }: { clientId: string }) {
  const { runs } = useInFlightRuns()
  const matching = runs.filter((r) => r.clientId === clientId)
  if (matching.length === 0) return null

  const headline =
    matching.length === 1
      ? 'Generation in flight'
      : `${matching.length} generations in flight`

  return (
    <Card className="bg-cream-warm border-border" role="region" aria-label={headline}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-foreground" />
          <p className="text-[14px] font-semibold">{headline}</p>
        </div>
        <ul className="space-y-2">
          {matching.map((run) => (
            <li key={run.id} data-testid="banner-row" className="text-[13px]">
              <span className="font-medium text-foreground">{formatMonthYear(run.targetMonth)}</span>
              <span className="text-muted-foreground"> · {stepLabel(run)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

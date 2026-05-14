'use client'

import { Loader2, Check } from 'lucide-react'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

function currentActiveStep(run: InFlightRun): string {
  if (run.supportingFacts) return 'Writing captions...'
  if (run.crawledContent) return 'Extracting facts...'
  if (run.brief) return 'Crawling websites...'
  return 'Starting up...'
}

export function RunProgressLine({ run }: { run: InFlightRun }) {
  // Persistent terminal: posts arrived or run is awaiting user choice
  if (run.postCount > 0 || run.intent === 'awaiting_choice') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Check className="size-3.5 shrink-0 text-green-600" />
        <span>Posts ready</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      <span>{currentActiveStep(run)}</span>
    </span>
  )
}

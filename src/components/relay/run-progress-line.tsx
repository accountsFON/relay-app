'use client'

import { Loader2 } from 'lucide-react'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

function currentActiveStep(run: InFlightRun): string {
  // Check the latest-completed phase, in reverse order, so a flag-on means
  // we have moved past that step and are working on the next one.
  if (run.supportingFacts) return 'Writing captions...'
  if (run.crawledContent) return 'Extracting facts...'
  if (run.brief) return 'Crawling websites...'
  return 'Starting up...'
}

export function RunProgressLine({ run }: { run: InFlightRun }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      <span>{currentActiveStep(run)}</span>
    </span>
  )
}

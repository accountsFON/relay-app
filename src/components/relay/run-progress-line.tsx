'use client'

import { Loader2, Check, XCircle } from 'lucide-react'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

function currentActiveStep(run: InFlightRun): string {
  if (run.supportingFacts) return 'Writing captions...'
  if (run.crawledContent) return 'Extracting facts...'
  if (run.brief) return 'Crawling websites...'
  return 'Starting up...'
}

export function RunProgressLine({ run }: { run: InFlightRun }) {
  if (run.intent === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <XCircle className="size-3.5 shrink-0 text-destructive" />
        <span>{`Failed: ${run.errorMessage ?? 'unknown error'}`}</span>
      </span>
    )
  }

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

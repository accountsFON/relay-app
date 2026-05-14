'use client'

import { Loader2 } from 'lucide-react'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

export function RunProgressLine({ run: _run }: { run: InFlightRun }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      <span>Starting up...</span>
    </span>
  )
}

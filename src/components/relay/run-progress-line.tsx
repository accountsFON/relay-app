'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, XCircle } from 'lucide-react'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

type CompletionLabel = 'Brief written' | 'Crawled' | 'Facts extracted' | 'Posts ready'

const FLASH_MS = 300

function currentActiveStep(run: InFlightRun): string {
  if (run.supportingFacts) return 'Writing captions...'
  if (run.crawledContent) return 'Extracting facts...'
  if (run.brief) return 'Crawling websites...'
  return 'Starting up...'
}

export function RunProgressLine({ run }: { run: InFlightRun }) {
  const prevRef = useRef<{
    brief: boolean
    crawledContent: boolean
    supportingFacts: boolean
    postCount: number
  }>({
    brief: run.brief,
    crawledContent: run.crawledContent,
    supportingFacts: run.supportingFacts,
    postCount: run.postCount,
  })
  const [justCompleted, setJustCompleted] = useState<CompletionLabel | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    // Latest-flip wins: check each transition in pipeline order, overwriting
    // earlier hits so the most-recent completion is the one we flash.
    let completed: CompletionLabel | null = null
    if (!prev.brief && run.brief) completed = 'Brief written'
    if (!prev.crawledContent && run.crawledContent) completed = 'Crawled'
    if (!prev.supportingFacts && run.supportingFacts) completed = 'Facts extracted'
    if (prev.postCount === 0 && run.postCount > 0) completed = 'Posts ready'

    prevRef.current = {
      brief: run.brief,
      crawledContent: run.crawledContent,
      supportingFacts: run.supportingFacts,
      postCount: run.postCount,
    }

    if (completed) {
      setJustCompleted(completed)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setJustCompleted(null)
        timerRef.current = null
      }, FLASH_MS)
    }
  }, [run.brief, run.crawledContent, run.supportingFacts, run.postCount])

  if (run.intent === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <XCircle className="size-3.5 shrink-0 text-destructive" />
        <span>{`Failed: ${run.errorMessage ?? 'unknown error'}`}</span>
      </span>
    )
  }

  if (justCompleted) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Check className="size-3.5 shrink-0 text-green-600" />
        <span>{justCompleted}</span>
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

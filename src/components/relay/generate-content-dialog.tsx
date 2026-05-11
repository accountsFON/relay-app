'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  triggerGeneration,
  getRunStatus,
  getClientCrawlInfo,
} from '@/app/(app)/clients/[id]/generate/actions'

type RunProgress = {
  id: string
  status: string
  brief: boolean
  crawledContent: boolean
  supportingFacts: boolean
  postCount: number
  totalCostUsd: number | null
  errorMessage: string | null
}

const STEP_INSIGHTS = [
  'Analyzing client profile and generating a strategic brief…',
  'Crawling client websites for fresh content and proof points…',
  'Extracting key facts, services, and differentiators…',
  'Writing on-brand captions with varied hooks and angles…',
]

export function GenerateContentDialog({
  clientId,
  targetMonth,
  lockMonth = false,
}: {
  clientId: string
  targetMonth: string
  lockMonth?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pickedMonth, setPickedMonth] = useState(targetMonth)
  const [reCrawl, setReCrawl] = useState(true)
  const [lastCrawled, setLastCrawled] = useState<string | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setProgress(null)
      setError(null)
    }
    setOpen(next)
  }

  // Pull crawl preferences when the dialog opens.
  useEffect(() => {
    if (!open) return
    getClientCrawlInfo(clientId).then((info) => {
      if (!info) return
      const shouldCrawl =
        info.autoCrawl === 'always' ||
        (info.autoCrawl === 'when_empty' && !info.hasCrawledData)
      setReCrawl(shouldCrawl)
      setLastCrawled(info.crawledDataAt)
    })
  }, [clientId, open])

  // Polling.
  useEffect(() => {
    if (!progress || progress.status === 'complete' || progress.status === 'failed') return
    const interval = setInterval(async () => {
      try {
        const next = await getRunStatus(progress.id)
        if (!next) return
        setProgress(next)
        if (next.status === 'complete') {
          completionTimer.current = setTimeout(() => {
            setOpen(false)
            setProgress(null)
            router.refresh()
          }, 800)
        }
      } catch (e) {
        clearInterval(interval)
      }
    }, 1000)
    return () => {
      clearInterval(interval)
      if (completionTimer.current) clearTimeout(completionTimer.current)
    }
  }, [progress?.id, progress?.status, router])

  const handleStart = () => {
    setError(null)
    startTransition(async () => {
      try {
        const monthToUse = lockMonth ? targetMonth : pickedMonth
        const { contentRunId } = await triggerGeneration(clientId, monthToUse, reCrawl)
        setProgress({
          id: contentRunId,
          status: 'running',
          brief: false,
          crawledContent: false,
          supportingFacts: false,
          postCount: 0,
          totalCostUsd: null,
          errorMessage: null,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start generation')
      }
    })
  }

  const monthLabel = formatMonth(targetMonth)
  const isComplete = progress?.status === 'complete'
  const isFailed = progress?.status === 'failed'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="accent" />}>Generate content</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          {lockMonth ? (
            <DialogTitle>Generate content for {monthLabel}</DialogTitle>
          ) : (
            <DialogTitle>Generate content</DialogTitle>
          )}
          <DialogDescription>
            {lockMonth
              ? "Locked to this batch’s month. Open a different batch to generate for a different month."
              : 'Choose the month to generate content for. Re-crawl is optional.'}
          </DialogDescription>
        </DialogHeader>

        {!progress && !error && (
          <div className="space-y-4 py-4">
            {!lockMonth && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="month-picker">Month</Label>
                <input
                  id="month-picker"
                  type="month"
                  value={pickedMonth}
                  onChange={(e) => setPickedMonth(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm w-full"
                />
              </div>
            )}
            <div className="flex items-start gap-3">
              <input
                id="recrawl-toggle"
                type="checkbox"
                checked={reCrawl}
                onChange={(e) => setReCrawl(e.target.checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="recrawl-toggle">Re-crawl client websites</Label>
                {lastCrawled && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last crawled {new Date(lastCrawled).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleStart} disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : 'Start generation'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {progress && (
          <div className="space-y-3 py-4">
            <StepProgressRow done={progress.brief} label={STEP_INSIGHTS[0]} />
            <StepProgressRow done={progress.crawledContent} label={STEP_INSIGHTS[1]} />
            <StepProgressRow done={progress.supportingFacts} label={STEP_INSIGHTS[2]} />
            <StepProgressRow done={progress.postCount > 0} label={STEP_INSIGHTS[3]} />
            {isComplete && (
              <p className="text-sm text-green-600 font-medium pt-2">
                {progress.postCount} posts generated. Updating page&hellip;
              </p>
            )}
            {isFailed && (
              <div className="space-y-2 pt-2">
                <p className="text-sm text-destructive">
                  Generation failed: {progress.errorMessage}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setProgress(null)
                    setError(null)
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="space-y-2 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StepProgressRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <Check className="size-4 text-green-600" />
      ) : (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

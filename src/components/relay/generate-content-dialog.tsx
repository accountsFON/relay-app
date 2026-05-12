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
import { Input } from '@/components/ui/input'
import {
  triggerGeneration,
  getRunStatus,
  getClientCrawlInfo,
} from '@/app/(app)/clients/[id]/generate/actions'
import {
  finalizePostGenerationAction,
  findMatchingBatchForRunAction,
  type FinalizePostGenerationInput,
} from '@/server/actions/finalize-post-generation'

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

type MatchingBatch = {
  batchId: string
  label: string
  postCount: number
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

  // Choice-panel state
  const [matchingBatch, setMatchingBatch] = useState<MatchingBatch | null>(null)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [showingNewBatchInput, setShowingNewBatchInput] = useState(false)
  const [newBatchLabel, setNewBatchLabel] = useState('')
  const [isFinalizing, setIsFinalizing] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setProgress(null)
      setError(null)
      setMatchingBatch(null)
      setConfirmingReplace(false)
      setShowingNewBatchInput(false)
      setNewBatchLabel('')
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
          clearInterval(interval)
          try {
            const matched = await findMatchingBatchForRunAction(next.id)
            if (matched) {
              // Always show the choice panel when a matching batch exists,
              // regardless of post count. The user wants to pick.
              setMatchingBatch(matched)
            } else {
              // No matching batch — auto-create a new one
              try {
                await finalizePostGenerationAction({ choice: 'auto-new', runId: next.id })
                setOpen(false)
                setProgress(null)
                router.refresh()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to attach posts')
              }
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to look up matching batch')
          }
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

  const handleChoice = async (input: FinalizePostGenerationInput) => {
    setIsFinalizing(true)
    try {
      await finalizePostGenerationAction(input)
      setOpen(false)
      setProgress(null)
      setMatchingBatch(null)
      setConfirmingReplace(false)
      setShowingNewBatchInput(false)
      setNewBatchLabel('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize')
    } finally {
      setIsFinalizing(false)
    }
  }

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
              ? "Locked to this batch's month. Open a different batch to generate for a different month."
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

        {progress && !matchingBatch && (
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

        {isComplete && matchingBatch && progress && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-green-600 font-medium">
              {progress.postCount} posts generated for {monthLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              {matchingBatch.postCount === 0
                ? `The "${matchingBatch.label}" batch is empty. What would you like to do with the ${progress?.postCount ?? 0} new posts?`
                : `The "${matchingBatch.label}" batch already has ${matchingBatch.postCount} posts. What would you like to do?`}
            </p>
            {/* Add */}
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={isFinalizing}
              onClick={() =>
                handleChoice({
                  choice: 'add',
                  runId: progress.id,
                  batchId: matchingBatch.batchId,
                })
              }
            >
              {matchingBatch.postCount === 0
                ? `Attach to "${matchingBatch.label}" batch`
                : `Add to "${matchingBatch.label}" batch (${progress.postCount + matchingBatch.postCount} total posts)`}
            </Button>

            {/* Replace -- only available when there are existing posts to delete */}
            {matchingBatch.postCount > 0 && (
              !confirmingReplace ? (
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive"
                  disabled={isFinalizing}
                  onClick={() => setConfirmingReplace(true)}
                >
                  Replace &quot;{matchingBatch.label}&quot; batch (delete {matchingBatch.postCount} existing)
                </Button>
              ) : (
                <div className="rounded border border-destructive p-3 space-y-2">
                  <p className="text-sm text-destructive">
                    This will permanently delete the {matchingBatch.postCount} existing posts
                    in the &quot;{matchingBatch.label}&quot; batch. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={isFinalizing}
                      onClick={() => setConfirmingReplace(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={isFinalizing}
                      onClick={() =>
                        handleChoice({
                          choice: 'replace',
                          runId: progress.id,
                          batchId: matchingBatch.batchId,
                        })
                      }
                    >
                      {isFinalizing ? <Loader2 className="size-4 animate-spin" /> : 'Yes, replace'}
                    </Button>
                  </div>
                </div>
              )
            )}

            {/* New batch -- needs label input */}
            {!showingNewBatchInput ? (
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={isFinalizing}
                onClick={() => setShowingNewBatchInput(true)}
              >
                Start a new batch
              </Button>
            ) : (
              <div className="rounded border border-border p-3 space-y-2">
                <Label htmlFor="new-batch-label">New batch label</Label>
                <Input
                  id="new-batch-label"
                  value={newBatchLabel}
                  onChange={(e) => setNewBatchLabel(e.target.value)}
                  placeholder={`${monthLabel} (rerun)`}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={isFinalizing}
                    onClick={() => setShowingNewBatchInput(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isFinalizing || (!newBatchLabel.trim() && !monthLabel)}
                    onClick={() =>
                      handleChoice({
                        choice: 'new',
                        runId: progress.id,
                        label: newBatchLabel.trim() || `${monthLabel} (rerun)`,
                      })
                    }
                  >
                    {isFinalizing ? <Loader2 className="size-4 animate-spin" /> : 'Create batch'}
                  </Button>
                </div>
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

'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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
import { getClientCrawlInfo } from '@/app/(app)/clients/[id]/generate/actions'
import { generateContentAction } from '@/server/actions/generate-content'
import type { GenerateContentResult } from '@/server/actions/generate-content'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { formatMonthYear } from '@/lib/batch-target-month'

type View =
  | { kind: 'picker' }
  | { kind: 'checking' }
  | { kind: 'confirm'; batchId: string; label: string; postCount: number }
  | { kind: 'firing' }
  | { kind: 'error'; message: string }

export function GenerateContentDialog({
  clientId,
  targetMonth,
  lockMonth = false,
}: {
  clientId: string
  targetMonth: string
  lockMonth?: boolean
}) {
  const { refresh } = useInFlightRuns()
  const [open, setOpen] = useState(false)
  const [pickedMonth, setPickedMonth] = useState(targetMonth)
  const [reCrawl, setReCrawl] = useState(false)
  const [lastCrawled, setLastCrawled] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'picker' })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setView({ kind: 'picker' })
    }
    setOpen(next)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getClientCrawlInfo(clientId).then((info) => {
      if (cancelled || !info) return
      setLastCrawled(info.crawledDataAt)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, open])

  const monthToUse = lockMonth ? targetMonth : pickedMonth

  async function probeThenFire(targetBatchId: string | null) {
    setView({ kind: 'firing' })
    const fire = await generateContentAction({
      kind: 'fire',
      clientId,
      targetMonth: monthToUse,
      targetBatchId,
      recrawl: reCrawl,
    })
    return handleFireResult(fire)
  }

  function handleFireResult(result: GenerateContentResult) {
    if (result.kind === 'fired') {
      refresh()
      setOpen(false)
      setView({ kind: 'picker' })
      return
    }
    if (result.kind === 'drift') {
      if (result.current) {
        setView({
          kind: 'confirm',
          batchId: result.current.batchId,
          label: result.current.label,
          postCount: result.current.postCount,
        })
      } else {
        runProbe()
      }
      return
    }
    if (result.kind === 'error') {
      setView({ kind: 'error', message: result.message })
      return
    }
    setView({ kind: 'error', message: 'Unexpected response from server' })
  }

  async function runProbe() {
    setView({ kind: 'checking' })
    const probe = await generateContentAction({
      kind: 'probe',
      clientId,
      targetMonth: monthToUse,
    })
    if (probe.kind === 'error') {
      setView({ kind: 'error', message: probe.message })
      return
    }
    if (probe.kind === 'no_match' || probe.kind === 'empty_batch') {
      await probeThenFire(null)
      return
    }
    if (probe.kind === 'needs_confirm') {
      setView({
        kind: 'confirm',
        batchId: probe.batchId,
        label: probe.label,
        postCount: probe.postCount,
      })
    }
  }

  async function handleReplace() {
    if (view.kind !== 'confirm') return
    await probeThenFire(view.batchId)
  }

  function handleCancelConfirm() {
    setView({ kind: 'picker' })
  }

  function handleRetry() {
    setView({ kind: 'picker' })
  }

  const dialogTitle = (() => {
    if (view.kind === 'confirm') return `Batch already exists`
    if (lockMonth) return `Generate content for ${formatMonthYear(targetMonth)}`
    return 'Generate content'
  })()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="accent"
            title="Generate next period's content for this client"
          />
        }
      >
        Generate content
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {view.kind === 'picker' && (
            <DialogDescription>
              {lockMonth
                ? "Locked to this relay's month. Open a different relay to generate for a different month."
                : 'Choose the month to generate content for. Re-crawl is optional.'}
            </DialogDescription>
          )}
          {view.kind === 'confirm' && (
            <DialogDescription>
              A batch already exists for {formatMonthYear(monthToUse)} with {view.postCount} post
              {view.postCount === 1 ? '' : 's'}. If you continue, the existing posts will be
              overwritten when the run completes. Current posts stay until the new ones are ready.
            </DialogDescription>
          )}
        </DialogHeader>

        {view.kind === 'picker' && (
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
              <Button onClick={runProbe}>Start generation</Button>
            </DialogFooter>
          </div>
        )}

        {view.kind === 'checking' && (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking for existing batch...
          </div>
        )}

        {view.kind === 'confirm' && (
          <div className="space-y-4 py-2">
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelConfirm}>Cancel</Button>
              <Button variant="destructive" onClick={handleReplace}>Replace</Button>
            </DialogFooter>
          </div>
        )}

        {view.kind === 'firing' && (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Starting generation...
          </div>
        )}

        {view.kind === 'error' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-destructive">{view.message}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleRetry}>Retry</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

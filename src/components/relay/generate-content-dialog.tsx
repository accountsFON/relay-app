'use client'

import { useState, useTransition, useEffect } from 'react'
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
import {
  triggerGeneration,
  getClientCrawlInfo,
} from '@/app/(app)/clients/[id]/generate/actions'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError(null)
    }
    setOpen(next)
  }

  // Show the last-crawled timestamp when the dialog opens, so the user
  // can decide whether to opt in to a fresh crawl. The Re-crawl checkbox
  // itself stays opt-in regardless of the client's autoCrawl setting.
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

  const handleStart = () => {
    setError(null)
    startTransition(async () => {
      try {
        const monthToUse = lockMonth ? targetMonth : pickedMonth
        await triggerGeneration(clientId, monthToUse, reCrawl)
        await refresh()
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start generation')
      }
    })
  }

  const monthLabel = formatMonth(targetMonth)

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
          {lockMonth ? (
            <DialogTitle>Generate content for {monthLabel}</DialogTitle>
          ) : (
            <DialogTitle>Generate content</DialogTitle>
          )}
          <DialogDescription>
            {lockMonth
              ? "Locked to this relay's month. Open a different relay to generate for a different month."
              : 'Choose the month to generate content for. Re-crawl is optional.'}
          </DialogDescription>
        </DialogHeader>

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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : 'Start generation'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

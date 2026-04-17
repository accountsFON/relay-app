'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { triggerGeneration, getRunStatus } from './actions'

function getNextMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

type RunProgress = {
  status: string
  brief: boolean
  crawledContent: boolean
  supportingFacts: boolean
  postCount: number
  totalCostUsd: number | null
  errorMessage: string | null
}

export default function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [targetMonth, setTargetMonth] = useState(getNextMonth)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (!clientId) {
    params.then((p) => setClientId(p.id))
    return <div className="p-8">Loading...</div>
  }

  const handleGenerate = () => {
    setError(null)
    startTransition(async () => {
      try {
        const { contentRunId } = await triggerGeneration(clientId, targetMonth)

        let attempts = 0
        const poll = setInterval(async () => {
          attempts++
          const status = await getRunStatus(contentRunId)
          if (status) {
            setProgress(status)
            if (status.status === 'complete' || status.status === 'failed' || attempts > 120) {
              clearInterval(poll)
            }
          }
        }, 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed')
      }
    })
  }

  const stepLabel = (p: RunProgress): string => {
    if (p.status === 'complete') return 'Complete'
    if (p.status === 'failed') return 'Failed'
    if (p.supportingFacts) return 'Writing captions...'
    if (p.crawledContent) return 'Extracting facts...'
    if (p.brief) return 'Crawling websites...'
    return 'Generating brief...'
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        Generate Content
      </h1>

      <Card className="p-6 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Target Month
        </label>
        <input
          type="month"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full mb-4"
        />
        <p className="text-sm text-slate-500 mb-4">
          Generate {formatMonth(targetMonth)} social media posts for this client.
        </p>
        <Button
          onClick={handleGenerate}
          disabled={isPending || progress?.status === 'running'}
        >
          {isPending ? 'Starting...' : `Generate ${formatMonth(targetMonth)}`}
        </Button>
      </Card>

      {error && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {progress && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Pipeline Progress</h2>

          <div className="space-y-3">
            <Step done={progress.brief} label="Brief generated" />
            <Step done={progress.crawledContent} label="Websites crawled" />
            <Step done={progress.supportingFacts} label="Facts extracted" />
            <Step
              done={progress.postCount > 0}
              label={
                progress.postCount > 0
                  ? `${progress.postCount} posts created`
                  : 'Captions pending'
              }
            />
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium">
              Status:{' '}
              <span
                className={
                  progress.status === 'complete'
                    ? 'text-green-600'
                    : progress.status === 'failed'
                      ? 'text-red-600'
                      : 'text-amber-600'
                }
              >
                {stepLabel(progress)}
              </span>
            </p>
            {progress.totalCostUsd !== null && (
              <p className="text-sm text-slate-500 mt-1">
                Cost: ${progress.totalCostUsd.toFixed(4)}
              </p>
            )}
            {progress.errorMessage && (
              <p className="text-sm text-red-600 mt-1">{progress.errorMessage}</p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          done
            ? 'bg-green-100 text-green-600'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        {done ? '✓' : '·'}
      </div>
      <span className={done ? 'text-slate-900' : 'text-slate-400'}>{label}</span>
    </div>
  )
}

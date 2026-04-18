'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { triggerGeneration, getRunStatus, getClientCrawlInfo } from './actions'
import { InfoTooltip } from '@/components/ui/info-tooltip'

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
  'Analyzing client profile and generating a strategic brief...',
  'Crawling client websites for fresh content and proof points...',
  'Extracting key facts, services, and differentiators...',
  'Writing on-brand captions with varied hooks and angles...',
]

export default function GeneratePage() {
  const { id: clientId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [targetMonth, setTargetMonth] = useState(searchParams.get('month') ?? getNextMonth())
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [elapsed, setElapsed] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)
  const [reCrawl, setReCrawl] = useState(true)
  const [crawlInfoLoaded, setCrawlInfoLoaded] = useState(false)
  const [lastCrawled, setLastCrawled] = useState<string | null>(null)

  useEffect(() => {
    getClientCrawlInfo(clientId).then((info) => {
      if (info) {
        const shouldCrawl =
          info.autoCrawl === 'always' ||
          (info.autoCrawl === 'when_empty' && !info.hasCrawledData)
        setReCrawl(shouldCrawl)
        setLastCrawled(info.crawledDataAt)
      }
      setCrawlInfoLoaded(true)
    })
  }, [clientId])

  useEffect(() => {
    if (!progress || progress.status === 'complete' || progress.status === 'failed') return
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [progress?.status])

  useEffect(() => {
    if (progress?.status === 'complete') {
      setShowCelebration(true)
      const timer = setTimeout(() => setShowCelebration(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [progress?.status])

  const handleGenerate = () => {
    setError(null)
    setProgress(null)
    setElapsed(0)
    startTransition(async () => {
      try {
        const { contentRunId } = await triggerGeneration(clientId, targetMonth, reCrawl)

        let attempts = 0
        const poll = setInterval(async () => {
          attempts++
          try {
            const status = await getRunStatus(contentRunId)
            if (status) {
              setProgress(status)
              if (status.status === 'complete' || status.status === 'failed' || attempts > 120) {
                clearInterval(poll)
              }
            }
          } catch {
            clearInterval(poll)
          }
        }, 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed')
      }
    })
  }

  const currentStep = (p: RunProgress): number => {
    if (p.postCount > 0) return 4
    if (p.supportingFacts) return 3
    if (p.crawledContent) return 2
    if (p.brief) return 1
    return 0
  }

  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl relative">
      {showCelebration && <Celebration />}

      <h1 className="text-xl font-bold text-foreground mb-4 sm:text-2xl sm:mb-6">
        Generate Content
      </h1>

      <Card className="p-6 mb-6">
        <label className="block text-sm font-medium text-foreground mb-2">
          Target Month
        </label>
        <input
          type="month"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full mb-4"
        />
        <p className="text-sm text-muted-foreground mb-4">
          Generate {formatMonth(targetMonth)} social media posts for this client.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="reCrawl"
            checked={reCrawl}
            onChange={(e) => setReCrawl(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="reCrawl" className="text-sm text-foreground">
            Re-crawl websites
          </label>
          <InfoTooltip text="When enabled, Relay crawls the client's websites for fresh content. When disabled, the pipeline uses previously stored website data. Disable to save time and credits for clients whose websites rarely change." />
          {lastCrawled && !reCrawl && (
            <span className="text-xs text-muted-foreground">
              (using data from {new Date(lastCrawled).toLocaleDateString()})
            </span>
          )}
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isPending || (progress?.status === 'running') || (progress?.status === 'queued')}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pipeline Progress</h2>
            {progress.status !== 'complete' && progress.status !== 'failed' && (
              <span className="text-sm text-muted-foreground/70 font-mono">{formatTime(elapsed)}</span>
            )}
          </div>

          <div className="space-y-4">
            <Step
              done={progress.brief}
              active={!progress.brief && progress.status === 'running'}
              label="Brief generated"
              detail="Strategic brief from client profile data"
            />
            <Step
              done={progress.crawledContent}
              active={progress.brief && !progress.crawledContent && progress.status === 'running'}
              label="Websites crawled"
              detail="Scraped client sites for fresh facts and proof points"
            />
            <Step
              done={progress.supportingFacts}
              active={progress.crawledContent && !progress.supportingFacts && progress.status === 'running'}
              label="Facts extracted"
              detail="Services, products, differentiators, and CTAs identified"
            />
            <Step
              done={progress.postCount > 0}
              active={progress.supportingFacts && progress.postCount === 0 && progress.status === 'running'}
              label={progress.postCount > 0 ? `${progress.postCount} posts created` : 'Writing captions'}
              detail={progress.postCount > 0 ? 'On-brand captions with varied hooks and angles' : 'Claude is writing each post with unique angles...'}
            />
          </div>

          {progress.status === 'running' && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-amber-600 italic">
                {STEP_INSIGHTS[currentStep(progress)] ?? 'Processing...'}
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
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
                    {progress.status === 'complete'
                      ? `Done in ${formatTime(elapsed)}`
                      : progress.status === 'failed'
                        ? 'Failed'
                        : 'Running...'}
                  </span>
                </p>
                {progress.totalCostUsd !== null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Cost: ${progress.totalCostUsd.toFixed(4)}
                    {progress.postCount > 0 && ` (${progress.postCount} posts)`}
                  </p>
                )}
                {progress.errorMessage && (
                  <p className="text-sm text-red-600 mt-1">{progress.errorMessage}</p>
                )}
              </div>

              {progress.status === 'complete' && progress.postCount > 0 && (
                <Link href={`/clients/${clientId}/runs/${progress.id}`}>
                  <Button>View Posts</Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function Step({
  done,
  active,
  label,
  detail,
}: {
  done: boolean
  active: boolean
  label: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mt-0.5 shrink-0 ${
          done
            ? 'bg-green-100 text-green-600'
            : active
              ? 'bg-amber-100 text-amber-600 animate-pulse'
              : 'bg-muted text-muted-foreground/70'
        }`}
      >
        {done ? '✓' : active ? '...' : '·'}
      </div>
      <div>
        <span className={done ? 'text-foreground font-medium' : active ? 'text-amber-700 font-medium' : 'text-muted-foreground/70'}>
          {label}
        </span>
        {(done || active) && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  )
}

function Celebration() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    color: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][Math.floor(Math.random() * 5)],
  }))

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.size > 10 ? '50%' : '2px',
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}

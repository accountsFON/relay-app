'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
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
  'Analyzing client profile and generating a strategic brief…',
  'Crawling client websites for fresh content and proof points…',
  'Extracting key facts, services, and differentiators…',
  'Writing on-brand captions with varied hooks and angles…',
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
  const [, setCrawlInfoLoaded] = useState(false)
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
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-2xl relative">
      {showCelebration && <Celebration />}

      <PageHeader
        title="Generate content"
        description={`Spin up a month of social posts for this client.`}
        backHref={`/clients/${clientId}`}
        backLabel="Back to client"
      />

      <div className="mt-10 space-y-6">
        <Card>
          <div className="px-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="targetMonth">Target month</Label>
              <input
                id="targetMonth"
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
              <p className="text-[13px] text-muted-foreground">
                Generates {formatMonth(targetMonth)} posts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reCrawl"
                checked={reCrawl}
                onChange={(e) => setReCrawl(e.target.checked)}
                className="size-4 rounded border-input accent-orange"
              />
              <Label htmlFor="reCrawl" className="cursor-pointer">
                Re-crawl websites
              </Label>
              <InfoTooltip text="When enabled, Relay crawls the client's websites for fresh content. When disabled, the pipeline uses previously stored website data. Disable to save time and credits for clients whose websites rarely change." />
              {lastCrawled && !reCrawl && (
                <span className="text-[12px] text-muted-foreground">
                  (using data from {new Date(lastCrawled).toLocaleDateString()})
                </span>
              )}
            </div>

            <Button
              variant="accent"
              size="lg"
              onClick={handleGenerate}
              disabled={isPending || (progress?.status === 'running') || (progress?.status === 'queued')}
            >
              {isPending ? 'Starting…' : `Generate ${formatMonth(targetMonth)}`}
            </Button>
          </div>
        </Card>

        {error && (
          <Card className="bg-destructive/5">
            <div className="px-5">
              <p className="text-[14px] text-destructive">{error}</p>
            </div>
          </Card>
        )}

        {progress && (
          <PageSection
            title="Pipeline progress"
            action={
              progress.status !== 'complete' && progress.status !== 'failed' ? (
                <span className="text-[13px] text-muted-foreground font-mono tabular-nums">
                  {formatTime(elapsed)}
                </span>
              ) : undefined
            }
          >
            <div className="space-y-5">
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
                detail={progress.postCount > 0 ? 'On-brand captions with varied hooks and angles' : 'Claude is writing each post with unique angles…'}
              />
            </div>

            {progress.status === 'running' && (
              <div className="mt-6 pt-5 border-t border-border">
                <p
                  className="text-[14px] text-foreground italic"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {STEP_INSIGHTS[currentStep(progress)] ?? 'Processing…'}
                </p>
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-border flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-foreground">
                  {progress.status === 'complete'
                    ? `Done in ${formatTime(elapsed)}`
                    : progress.status === 'failed'
                      ? 'Failed'
                      : 'Running…'}
                </p>
                {progress.totalCostUsd !== null && (
                  <p className="text-[13px] text-muted-foreground mt-0.5 tabular-nums">
                    ${progress.totalCostUsd.toFixed(4)}
                    {progress.postCount > 0 && ` · ${progress.postCount} posts`}
                  </p>
                )}
                {progress.errorMessage && (
                  <p className="text-[13px] text-destructive mt-1">{progress.errorMessage}</p>
                )}
              </div>

              {progress.status === 'complete' && progress.postCount > 0 && (
                <Link href={`/clients/${clientId}/runs/${progress.id}`}>
                  <Button variant="accent">View posts</Button>
                </Link>
              )}
            </div>
          </PageSection>
        )}
      </div>
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
        className={`size-7 rounded-full flex items-center justify-center shrink-0 ${
          done
            ? 'bg-foreground text-cream'
            : active
              ? 'bg-orange/15 text-orange'
              : 'bg-cream-warm text-ink-20'
        }`}
      >
        {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
      </div>
      <div className="pt-1">
        <p className={done || active ? 'text-[14px] font-semibold text-foreground' : 'text-[14px] text-muted-foreground'}>
          {label}
        </p>
        {(done || active) && (
          <p className="text-[13px] text-muted-foreground mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  )
}

function Celebration() {
  const particles = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    color: ['#FF4A1A', '#131521', '#F5F2EA', '#FF4A1A', '#2A2E45'][Math.floor(Math.random() * 5)],
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

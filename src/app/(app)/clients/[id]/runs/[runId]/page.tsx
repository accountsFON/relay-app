import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findContentRun } from '@/server/repositories/contentRuns'
import { PostCard } from './post-card'
import { ExportButton } from './export-button'
import { CostBreakdown } from './cost-breakdown'
import { PostVersionHistory } from './post-version-history'
import { FailedRunBanner } from './failed-run-banner'
import { listVersionsForPost } from '@/server/services/postVersions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, runId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) notFound()

  const run = await findContentRun(runId)
  if (!run || run.clientId !== id) notFound()

  const monthLabel = formatMonth(run.targetMonth)
  const credits = run.creditsConsumed ?? 0
  const isFailed = run.status === 'failed'
  const description = [
    `${run.posts.length} post${run.posts.length === 1 ? '' : 's'}`,
    run.totalCostUsd && `$${Number(run.totalCostUsd).toFixed(2)} cost`,
    credits > 0 && `${credits} ${credits === 1 ? 'credit' : 'credits'}`,
    isFailed && 'failed',
  ]
    .filter(Boolean)
    .join(' · ')

  // The pipeline persists tokenUsage on every run, populated incrementally as
  // each step completes. On failure we also stash an `errorContext` block
  // there (see generateContent.ts catch). Read it back tolerantly: older
  // failed runs predate this capture and only have errorMessage.
  const tokenUsage =
    run.tokenUsage && typeof run.tokenUsage === 'object'
      ? (run.tokenUsage as Record<string, unknown>)
      : null
  const breakdown = tokenUsage && 'breakdown' in tokenUsage
    ? (tokenUsage.breakdown as Parameters<typeof CostBreakdown>[0]['breakdown'])
    : null
  const pipelineDurationSeconds =
    tokenUsage && 'pipelineDurationSeconds' in tokenUsage
      ? Number((tokenUsage as Record<string, unknown>).pipelineDurationSeconds)
      : null
  const errorContext =
    tokenUsage && 'errorContext' in tokenUsage
      ? (tokenUsage.errorContext as {
          name?: string
          message?: string
          stack?: string | null
          capturedAt?: string
        })
      : null

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title={`${client.name}, ${monthLabel}`}
        description={description}
        backHref={`/clients/${id}`}
        backLabel={`Back to ${client.name}`}
        actions={
          <>
            {!isFailed && run.posts.length > 0 && (
              <ExportButton
                posts={run.posts.map((p) => ({
                  date: p.postDate.toISOString().split('T')[0],
                  caption: p.caption,
                  hashtags: p.hashtags.join(' '),
                  graphicHook: p.graphicHook ?? '',
                  designerNotes: p.designerNotes ?? '',
                }))}
                filename={`${client.name}-${run.targetMonth}`}
              />
            )}
            <Link href={`/clients/${id}/generate`}>
              <Button variant="outline">
                {isFailed ? 'Retry generation' : 'Generate another month'}
              </Button>
            </Link>
          </>
        }
      />

      {isFailed && (
        <div className="mt-6">
          <FailedRunBanner
            errorMessage={run.errorMessage}
            errorContext={errorContext}
            failedStep={inferFailedStep(run)}
            pipelineDurationSeconds={
              Number.isFinite(pipelineDurationSeconds) ? pipelineDurationSeconds : null
            }
            reRunHref={`/clients/${id}/generate`}
            partialPostCount={run.posts.length}
          />
        </div>
      )}

      <div className="mt-8">
        <CostBreakdown
          breakdown={breakdown}
          pipelineDurationSeconds={
            Number.isFinite(pipelineDurationSeconds) ? pipelineDurationSeconds : null
          }
        />
      </div>

      {run.posts.length > 0 && (
        <div className="mt-8 space-y-4">
          {isFailed && (
            <p className="text-[13px] text-muted-foreground">
              Partial output below. These posts were persisted before the run failed.
            </p>
          )}
          {await Promise.all(
            run.posts.map(async (post) => {
              const versions = await listVersionsForPost(post.id)
              const versionRows = versions.map((v) => ({
                id: v.id,
                caption: v.caption,
                hashtagCount: v.hashtags.length,
                createdAt: v.createdAt,
                authorName: v.author?.name ?? null,
              }))
              return (
                <div key={post.id} className="space-y-2">
                  <PostCard post={post} />
                  <PostVersionHistory postId={post.id} versions={versionRows} />
                </div>
              )
            }),
          )}
        </div>
      )}
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Best effort inference of which pipeline step blew up, based on which
 * intermediate fields the run did and didn't manage to populate. The pipeline
 * writes each step's output back to the ContentRun row before moving on, so
 * the last populated field tells us where progress halted.
 *
 * Source of truth for step order: src/server/jobs/generateContent.ts.
 *   1. posting dates  -> postingDates array
 *   2. brief          -> brief
 *   3. crawl          -> crawledContent
 *   4. facts          -> supportingFacts
 *   5. captions       -> Posts created
 */
function inferFailedStep(run: {
  brief: string | null
  crawledContent: string | null
  supportingFacts: string | null
  postingDates: string[]
  posts: { id: string }[]
}): string {
  if (!run.postingDates || run.postingDates.length === 0) {
    return 'date calculation'
  }
  if (!run.brief) return 'brief generation'
  if (!run.crawledContent) return 'website crawl'
  if (!run.supportingFacts) return 'facts extraction'
  if (run.posts.length === 0) return 'caption generation'
  return 'post finalization'
}

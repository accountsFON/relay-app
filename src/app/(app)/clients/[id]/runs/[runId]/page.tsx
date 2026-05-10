import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findContentRun } from '@/server/repositories/contentRuns'
import { PostCard } from './post-card'
import { ExportButton } from './export-button'
import { CostBreakdown } from './cost-breakdown'
import { PostVersionHistory } from './post-version-history'
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
  const description = [
    `${run.posts.length} posts`,
    run.totalCostUsd && `$${Number(run.totalCostUsd).toFixed(2)} cost`,
    credits > 0 && `${credits} ${credits === 1 ? 'credit' : 'credits'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title={`${client.name} — ${monthLabel}`}
        description={description}
        backHref={`/clients/${id}`}
        backLabel={`Back to ${client.name}`}
        actions={
          <>
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
            <Link href={`/clients/${id}/generate`}>
              <Button variant="outline">Generate another month</Button>
            </Link>
          </>
        }
      />

      <div className="mt-8">
        <CostBreakdown
          breakdown={
            run.tokenUsage &&
            typeof run.tokenUsage === 'object' &&
            'breakdown' in (run.tokenUsage as Record<string, unknown>)
              ? (run.tokenUsage as Record<string, unknown>).breakdown as Parameters<typeof CostBreakdown>[0]['breakdown']
              : null
          }
          pipelineDurationSeconds={
            run.tokenUsage &&
            typeof run.tokenUsage === 'object' &&
            'pipelineDurationSeconds' in (run.tokenUsage as Record<string, unknown>)
              ? Number((run.tokenUsage as Record<string, unknown>).pipelineDurationSeconds)
              : null
          }
        />
      </div>

      <div className="mt-8 space-y-4">
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
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

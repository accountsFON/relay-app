import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { findContentRun } from '@/server/repositories/contentRuns'
import { PostCard } from './post-card'
import { ExportButton } from './export-button'
import { CostBreakdown } from './cost-breakdown'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, runId } = await params

  const client = await findClientById(id, ctx.organizationDbId)
  if (!client) notFound()

  const run = await findContentRun(runId)
  if (!run || run.clientId !== id) notFound()

  const monthLabel = formatMonth(run.targetMonth)
  const description = [
    `${run.posts.length} posts`,
    run.totalCostUsd && `$${Number(run.totalCostUsd).toFixed(4)} cost`,
    run.creditsConsumed && `${run.creditsConsumed} credits`,
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
                status: p.approvalStatus,
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
        {run.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { findContentRun } from '@/server/repositories/contentRuns'
import { PostCard } from './post-card'
import { ExportButton } from './export-button'
import { CostBreakdown } from './cost-breakdown'
import { Button } from '@/components/ui/button'

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

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-4 sm:mb-6">
        <Link
          href={`/clients/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to {client.name}
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            {client.name} &mdash; {monthLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {run.posts.length} posts
            {run.totalCostUsd && ` · $${Number(run.totalCostUsd).toFixed(4)} cost`}
            {run.creditsConsumed && ` · ${run.creditsConsumed} credits`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
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
        </div>
      </div>

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

      <div className="space-y-4 mt-6">
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

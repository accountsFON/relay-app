import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { findContentRun } from '@/server/repositories/contentRuns'
import { PostCard } from './post-card'
import { ExportButton } from './export-button'
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
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link
          href={`/clients/${id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to {client.name}
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {client.name} — {monthLabel}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {run.posts.length} posts
            {run.totalCostUsd && ` · $${Number(run.totalCostUsd).toFixed(4)} cost`}
            {run.creditsConsumed && ` · ${run.creditsConsumed} credits`}
          </p>
        </div>
        <div className="flex gap-2">
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

      <div className="space-y-4">
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

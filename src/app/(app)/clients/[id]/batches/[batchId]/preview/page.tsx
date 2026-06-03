import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireClientViewer, canEditClients, canUploadPostMedia } from '@/server/middleware/permissions'
import { redirectAccessDenied } from '@/server/auth/access'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import { listThreadsForBatch } from '@/server/repositories/threads'
import { derivePostApprovalForBatch } from '@/server/services/approval'
import { db } from '@/db/client'
import { HeroBand } from '@/components/hero-band'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'
import { PreviewPageShell } from './preview-page-shell'
import { EventAnchor } from '@/components/notifications/event-anchor'
import { PreviewSubmitButton } from '@/components/notifications/preview-submit-button'
import { Button } from '@/components/ui/button'

/**
 * Internal batch preview page (Layer 2 / Task 2.1).
 *
 * Composes the Layer 1 preview components (FeedShell, IG/FB feed posts,
 * per-post media upload, bulk media tray) into a single AM-facing surface.
 *
 * Auth: standard client.view gate via requireClientViewer + findClientForUser
 * scoping. Mode is always 'internal' here, magic-link client view ships in
 * Task 2.2 at /review/[token] reusing the same preview shell with mode='review'.
 */
export default async function BatchPreviewPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>
}) {
  const ctx = await requireClientViewer()
  const { id, batchId } = await params

  const client = await findClientForUser(ctx, id)
  if (!client) redirectAccessDenied()

  const batch = await findBatch(batchId)
  if (!batch || batch.clientId !== client.id) redirectAccessDenied()

  const posts = await db.post.findMany({
    where: { batchId: batch.id },
    orderBy: { postDate: 'asc' },
    select: {
      id: true,
      postDate: true,
      caption: true,
      hashtags: true,
      mediaUrls: true,
    },
  })

  const [threadsByPost, approvalCounts] = await Promise.all([
    listThreadsForBatch({ batchId: batch.id }),
    derivePostApprovalForBatch(batch.id),
  ])

  // Count AM-authored unresolved post-thread comments on this batch so the
  // sticky Submit button can show the count + disable itself when there is
  // nothing to send. Mirrors the count query in submitPreviewReviewAction;
  // computing it here in the server component avoids a round trip on mount
  // and a flash of "Submit (0)".
  const [initialCommentCount, assignedDesigner] = await Promise.all([
    db.postComment.count({
      where: {
        authorId: ctx.userDbId,
        thread: {
          resolvedAt: null,
          post: { batchId: batch.id },
        },
      },
    }),
    client.assignedDesignerId
      ? db.user.findUnique({
          where: { id: client.assignedDesignerId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ])
  const designerName = assignedDesigner?.name ?? null

  // Hydrate posts with media + threads for the client shell.
  const hydratedPosts = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    hashtags: p.hashtags,
    mediaUrl: p.mediaUrls?.[0] ?? null,
    postDate: p.postDate,
    threads: threadsByPost.get(p.id) ?? [],
  }))

  // Drive the bulk tray visibility off the same canEdit gate the batch page uses.
  const canEdit = canEditClients(ctx)
  const canUploadMedia = canUploadPostMedia(ctx)

  // Total open thread count across the whole batch powers the
  // Mark batch reviewed confirm dialog copy.
  const totalOpenThreads = hydratedPosts.reduce(
    (sum, p) => sum + p.threads.filter((t) => t.status === 'open').length,
    0,
  )

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-7xl">
      <EventAnchor />
      <HeroBand
        title={`${batch.label} preview`}
        subtitle={`${client.name} · ${approvalCounts.ready} ready · ${approvalCounts.pending} pending`}
        breadcrumb={[
          { label: 'My Relay', href: '/dashboard' },
          { label: client.name, href: `/clients/${client.id}` },
          { label: batch.label, href: `/clients/${client.id}/batches/${batch.id}` },
          { label: 'Preview' },
        ]}
      />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canEdit && (
          <MarkBatchReviewedButton
            batchId={batch.id}
            openThreadCount={totalOpenThreads}
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          render={<Link href={`/clients/${client.id}/batches/${batch.id}`} />}
        >
          <ChevronLeft className="text-muted-foreground" />
          <span>Back to relay</span>
        </Button>
      </div>

      <div className="mt-8">
        <PreviewPageShell
          batchId={batch.id}
          client={{ id: client.id, name: client.name }}
          posts={hydratedPosts}
          canEdit={canEdit}
          canUploadMedia={canUploadMedia}
        />
      </div>

      {canEdit && (
        <PreviewSubmitButton
          batchId={batch.id}
          designerName={designerName}
          initialCommentCount={initialCommentCount}
        />
      )}
    </div>
  )
}

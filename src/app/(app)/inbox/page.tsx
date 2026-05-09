/**
 * /inbox — mentions grouped by client.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § Inbox surfaces
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 1b, 2
 *
 * Behavior (V1):
 * - Lists unread + recently-read mentions for the current user.
 * - Each row deep-links to /clients/[id]/batches/[batchId] (or client thread)
 *   anchored on the mentioned event.
 * - Mark-all-read button at top.
 *
 * Phase: skeleton now. Phase 1b adds the layout shell + empty state.
 *        Phase 2 wires:
 *          - listMentionsForUser (Caleb-owned read repo)
 *          - markMentionReadAction (Caleb-owned)
 *
 * Schema dep: Mention model (Rails-owned). Page renders empty state until then.
 */
import { requireOrgContext } from '@/server/middleware/auth'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/ui/empty-state'

export default async function InboxPage() {
  await requireOrgContext()

  // TODO Phase 2: replace with real fetch
  // const mentions = await listMentionsForUser(ctx.userId, { unreadOnly: false, limit: 50 })
  const mentions: never[] = []

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title="Inbox"
        description="Mentions and replies, grouped by client. Click any row to jump to the thread."
      />

      <div className="mt-10">
        {mentions.length === 0 ? (
          <EmptyState
            title="No mentions yet"
            description="When someone @-mentions you in an activity thread, it shows up here. Replies to your comments do too."
          />
        ) : (
          // TODO Phase 2: render grouped MentionInboxRow list
          <p className="text-sm text-muted-foreground">TODO: mention list</p>
        )}
      </div>
    </div>
  )
}

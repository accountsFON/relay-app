import Link from 'next/link'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  listMentionsForUser,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { markAllMentionsReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { InboxRow } from './inbox-row'

export default async function InboxPage() {
  const ctx = await requireOrgContext()
  const mentions = await listMentionsForUser(ctx.userDbId, {
    limit: 100,
    visibilityFilter: visibilityForViewer(ctx),
  })

  // Group by client.
  const byClient = new Map<
    string,
    { name: string; rows: typeof mentions }
  >()
  for (const m of mentions) {
    const bucket = byClient.get(m.client.id) ?? {
      name: m.client.name,
      rows: [],
    }
    bucket.rows.push(m)
    byClient.set(m.client.id, bucket)
  }

  const unreadCount = mentions.filter((m) => !m.readAt).length

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title="Inbox"
        description={
          unreadCount > 0
            ? `${unreadCount} unread mention${unreadCount === 1 ? '' : 's'}.`
            : 'Mentions and replies, grouped by client.'
        }
      />

      {mentions.length > 0 && unreadCount > 0 && (
        <form
          action={async () => {
            'use server'
            await markAllMentionsReadAction()
          }}
          className="mt-4"
        >
          <Button type="submit" variant="outline" size="sm">
            Mark all read
          </Button>
        </form>
      )}

      <div className="mt-8 space-y-8">
        {mentions.length === 0 ? (
          <EmptyState
            title="No mentions yet"
            description="When someone @-mentions you in an activity thread, it shows up here."
          />
        ) : (
          Array.from(byClient.entries()).map(([clientId, group]) => (
            <section key={clientId} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h2>
                <Link
                  href={`/clients/${clientId}`}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open thread
                </Link>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border bg-background">
                {group.rows.map((row) => (
                  <li key={row.mentionId}>
                    <InboxRow row={row} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

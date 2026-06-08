import Link from 'next/link'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  listMentionsForUser,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { HeroBand } from '@/components/hero-band'
import { EmptyStateCard } from '@/components/ui/empty-state-card'
import { Button } from '@/components/ui/button'
import { PageSection } from '@/components/ui/page-section'
import { cn } from '@/lib/utils'
import { markAllMentionsReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { InboxRow } from './inbox-row'
import { ClearAllButton } from './clear-all-button'

type InboxView = 'timeline' | 'client'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext()
  const sp = await searchParams
  // Timeline (chronological, newest first) is the default; "by client" groups.
  const view: InboxView = sp.view === 'client' ? 'client' : 'timeline'

  const mentions = await listMentionsForUser(ctx.userDbId, {
    organizationId: ctx.organizationDbId,
    limit: 100,
    visibilityFilter: visibilityForViewer(ctx),
  })

  // Group by client (only rendered in the "by client" view). Mentions are
  // already newest-first, so each bucket stays chronological internally.
  const byClient = new Map<string, { name: string; rows: typeof mentions }>()
  for (const m of mentions) {
    const bucket = byClient.get(m.client.id) ?? { name: m.client.name, rows: [] }
    bucket.rows.push(m)
    byClient.set(m.client.id, bucket)
  }

  const unreadCount = mentions.filter((m) => !m.readAt).length

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <HeroBand
        title="Inbox"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread mention${unreadCount === 1 ? '' : 's'}.`
            : view === 'client'
              ? 'Mentions and replies, grouped by client.'
              : 'Mentions and replies, newest first.'
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ViewToggle view={view} />
        {mentions.length > 0 && unreadCount > 0 && (
          <form
            action={async () => {
              'use server'
              await markAllMentionsReadAction()
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        )}
        {mentions.length > 0 && (
          <ClearAllButton count={mentions.length} unreadCount={unreadCount} />
        )}
      </div>

      <div className="mt-8 space-y-8">
        {mentions.length === 0 ? (
          <div className="mx-auto max-w-md">
            <EmptyStateCard
              tint="blue"
              shape="starburst"
              label="Inbox zero. Mentions show up here."
            />
          </div>
        ) : view === 'timeline' ? (
          <ul className="divide-y divide-border rounded-md border border-border bg-background">
            {mentions.map((row) => (
              <li key={row.mentionId}>
                <InboxRow row={row} />
              </li>
            ))}
          </ul>
        ) : (
          Array.from(byClient.entries()).map(([clientId, group]) => (
            <PageSection
              key={clientId}
              title={group.name}
              action={
                <Link
                  href={`/clients/${clientId}`}
                  className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Open thread
                </Link>
              }
            >
              <ul className="divide-y divide-border rounded-md border border-border bg-background">
                {group.rows.map((row) => (
                  <li key={row.mentionId}>
                    <InboxRow row={row} />
                  </li>
                ))}
              </ul>
            </PageSection>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Segmented Timeline / By client switch. Server-rendered links that flip the
 * `view` query param; timeline is the default (no param needed).
 */
function ViewToggle({ view }: { view: InboxView }) {
  const base = 'rounded-full px-3 py-1 text-[13px] transition-colors'
  const active = 'bg-foreground text-neutral-50'
  const inactive = 'text-muted-foreground hover:text-foreground'
  return (
    <div
      role="tablist"
      aria-label="Inbox view"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
    >
      <Link
        href="/inbox"
        role="tab"
        aria-selected={view === 'timeline'}
        className={cn(base, view === 'timeline' ? active : inactive)}
      >
        Timeline
      </Link>
      <Link
        href="/inbox?view=client"
        role="tab"
        aria-selected={view === 'client'}
        className={cn(base, view === 'client' ? active : inactive)}
      >
        By client
      </Link>
    </div>
  )
}

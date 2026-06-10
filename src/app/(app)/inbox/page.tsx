import Link from 'next/link'
import { requireOrgContext } from '@/server/middleware/auth'
import { getClientScopeFilter } from '@/server/auth/scope'
import {
  listMentionsForUser,
  unreadMentionCount,
  mentionCountForUser,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { paginateMentions } from '@/lib/paginate-mentions'
import { HeroBand } from '@/components/hero-band'
import { EmptyStateCard } from '@/components/ui/empty-state-card'
import { Button } from '@/components/ui/button'
import { PageSection } from '@/components/ui/page-section'
import { cn } from '@/lib/utils'
import { markAllMentionsReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import { InboxRow } from './inbox-row'
import { ClearAllButton } from './clear-all-button'

type InboxView = 'timeline' | 'client'

/** Notifications shown on first load, and the increment per "Load more". */
const PAGE_SIZE = 10
/** Hard ceiling so a hand-edited ?take= can't request the whole table. */
const MAX_TAKE = 500

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext()
  const sp = await searchParams
  // Timeline (chronological, newest first) is the default; "by client" groups.
  const view: InboxView = sp.view === 'client' ? 'client' : 'timeline'

  // Lazy load: show PAGE_SIZE most recent, reveal more via the Load more link
  // (which bumps ?take). Capped so a hand-edited URL can't request everything.
  const takeRaw = Array.isArray(sp.take) ? sp.take[0] : sp.take
  const parsedTake = Number.parseInt(takeRaw ?? '', 10)
  const take =
    Number.isFinite(parsedTake) && parsedTake > 0
      ? Math.min(parsedTake, MAX_TAKE)
      : PAGE_SIZE

  const clientScope = getClientScopeFilter(ctx)
  const visibility = visibilityForViewer(ctx)
  const [rows, unreadCount, totalCount] = await Promise.all([
    // Over-fetch one row to detect a next page without a second query.
    listMentionsForUser(ctx.userDbId, {
      organizationId: ctx.organizationDbId,
      limit: take + 1,
      visibilityFilter: visibility,
      clientScope,
    }),
    unreadMentionCount(ctx.userDbId, ctx.organizationDbId, visibility, clientScope),
    mentionCountForUser(ctx.userDbId, ctx.organizationDbId, visibility, clientScope),
  ])
  const { visible: mentions, hasMore } = paginateMentions(rows, take)

  // Group by client (only rendered in the "by client" view). Mentions are
  // already newest-first, so each bucket stays chronological internally.
  const byClient = new Map<string, { name: string; rows: typeof mentions }>()
  for (const m of mentions) {
    const bucket = byClient.get(m.client.id) ?? { name: m.client.name, rows: [] }
    bucket.rows.push(m)
    byClient.set(m.client.id, bucket)
  }

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
        {totalCount > 0 && unreadCount > 0 && (
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
        {totalCount > 0 && (
          <ClearAllButton count={totalCount} unreadCount={unreadCount} />
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

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Link
              href={`/inbox?${view === 'client' ? 'view=client&' : ''}take=${take + PAGE_SIZE}`}
              scroll={false}
            >
              <Button variant="outline" size="sm">
                Load more
              </Button>
            </Link>
          </div>
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

import Link from 'next/link'
import { requireOrgContext } from '@/server/middleware/auth'
import { canEditClients } from '@/server/middleware/permissions'
import { searchAcrossEntities } from '@/server/repositories/search'
import { HeroBand } from '@/components/hero-band'
import { EmptyStateCard } from '@/components/ui/empty-state-card'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PostSearchResultActions } from '@/components/search/post-search-result-actions'
import { formatRelative } from '@/lib/format-relative'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const filter = typeof sp.type === 'string' ? sp.type : 'all'
  const canEdit = canEditClients(ctx)

  const results = q ? await searchAcrossEntities(ctx, q) : null

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <HeroBand
        title={q ? `Results for "${q}"` : 'Search'}
        subtitle={
          results
            ? `${results.total} match${results.total === 1 ? '' : 'es'} across clients, posts, runs, and comments.`
            : 'Search across clients, runs, posts, and comments.'
        }
      />

      {!q && (
        <div className="mt-8 mx-auto max-w-md">
          <EmptyStateCard
            tint="yellow"
            shape="blob"
            label="Type a query in the top search bar to land here."
          />
        </div>
      )}

      {results && results.total === 0 && (
        <div className="mt-8 mx-auto max-w-md">
          <EmptyStateCard
            tint="coral"
            shape="asterisk"
            label={`No matches for "${q}". Try a shorter query.`}
          />
        </div>
      )}

      {results && results.total > 0 && (
        <>
          <FilterRail q={q} filter={filter} results={results} />

          <div className="mt-6 space-y-10">
            {showSection(filter, 'clients') && results.clients.length > 0 && (
              <SectionHeader title="Clients" count={results.clients.length}>
                <ul className="space-y-2">
                  {results.clients.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/clients/${c.id}`}
                        className="block rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-cream-warm"
                      >
                        <div className="flex items-baseline gap-2">
                          <p className="text-[15px] font-semibold text-foreground">
                            {c.name}
                          </p>
                          {c.industry && (
                            <span className="text-[12px] text-muted-foreground">
                              {c.industry}
                            </span>
                          )}
                          {c.location && (
                            <span className="text-[12px] text-muted-foreground">
                              · {c.location}
                            </span>
                          )}
                        </div>
                        {c.snippet && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                            {c.snippet}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionHeader>
            )}

            {showSection(filter, 'posts') && results.posts.length > 0 && (
              <SectionHeader title="Posts" count={results.posts.length}>
                <ul className="space-y-2">
                  {results.posts.map((p) => (
                    <li key={p.id} className="relative">
                      <Link
                        href={`/clients/${p.clientId}/runs/${p.contentRunId}`}
                        className="block rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-cream-warm"
                      >
                        <div className="flex items-baseline gap-2 text-[12px] text-muted-foreground">
                          <span className="font-medium text-foreground">{p.clientName}</span>
                          <span>· {formatPostDate(p.postDate)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] text-foreground pr-8">
                          {p.caption}
                        </p>
                        {p.hashtags.length > 0 && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {p.hashtags
                              .slice(0, 8)
                              .map((h) => (h.startsWith('#') ? h : `#${h}`))
                              .join(' ')}
                          </p>
                        )}
                      </Link>
                      {canEdit && (
                        <div className="absolute right-2 top-2">
                          <PostSearchResultActions postId={p.id} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionHeader>
            )}

            {showSection(filter, 'runs') && results.runs.length > 0 && (
              <SectionHeader title="Runs" count={results.runs.length}>
                <ul className="space-y-2">
                  {results.runs.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/clients/${r.clientId}/runs/${r.id}`}
                        className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-cream-warm"
                      >
                        <div>
                          <p className="text-[14px] font-medium text-foreground">
                            {r.clientName} — {r.targetMonth}
                          </p>
                        </div>
                        <Badge variant="outline">{r.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionHeader>
            )}

            {showSection(filter, 'comments') && results.comments.length > 0 && (
              <SectionHeader title="Comments" count={results.comments.length}>
                <ul className="space-y-2">
                  {results.comments.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/clients/${c.clientId}`}
                        className="block rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-cream-warm"
                      >
                        <div className="flex items-baseline gap-2 text-[12px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {c.actorName ?? 'Unknown'}
                          </span>
                          <span>· in {c.clientName}</span>
                          <span>· {formatRelative(c.createdAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-[13px] text-foreground">
                          {c.body}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionHeader>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FilterRail({
  q,
  filter,
  results,
}: {
  q: string
  filter: string
  results: { clients: unknown[]; posts: unknown[]; runs: unknown[]; comments: unknown[] }
}) {
  const tabs = [
    { value: 'all', label: 'All', count: results.clients.length + results.posts.length + results.runs.length + results.comments.length },
    { value: 'clients', label: 'Clients', count: results.clients.length },
    { value: 'posts', label: 'Posts', count: results.posts.length },
    { value: 'runs', label: 'Runs', count: results.runs.length },
    { value: 'comments', label: 'Comments', count: results.comments.length },
  ]
  return (
    <nav className="mt-8 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={`/search?q=${encodeURIComponent(q)}${t.value === 'all' ? '' : `&type=${t.value}`}`}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
            filter === t.value
              ? 'bg-foreground text-background'
              : 'bg-cream-warm text-ink-50 hover:bg-cream-80 hover:text-foreground'
          }`}
        >
          {t.label}
          <span className="text-[11px] opacity-70">{t.count}</span>
        </Link>
      ))}
    </nav>
  )
}

function showSection(filter: string, section: 'clients' | 'posts' | 'runs' | 'comments'): boolean {
  return filter === 'all' || filter === section
}

function SectionHeader({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-[12px] text-muted-foreground">{count}</span>
      </div>
      {children}
    </Card>
  )
}

function formatPostDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

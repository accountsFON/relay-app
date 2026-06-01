/**
 * Search repository: Postgres full text search across the major entities.
 *
 * Spec: projects/relay-app/2026-05-09-future-features-exploration.md § 3
 *
 * Approach for V1:
 * - Postgres `to_tsvector('simple', ...)` + `plainto_tsquery('simple', $q)`.
 *   Using `simple` config (no stemming) keeps results predictable for short
 *   tag-style queries; switch to `english` when stemming is more valuable.
 * - No GIN indexes yet (data volume is small enough that a seq scan is fine).
 *   Add GIN via raw migration when a perf complaint shows up.
 * - Permission scope every result: clients via getClientScopeFilter,
 *   posts/runs/comments via the parent client's scope, comments also
 *   filtered by ActivityEvent visibility for the viewer.
 *
 * Each section caps at 25 hits to keep the page responsive; the UI nudges
 * the user to refine when they hit the cap.
 */
import { db } from '@/db/client'
import { Prisma, EventVisibility } from '@prisma/client'
import { getClientScopeFilter } from '@/server/auth/scope'
import { visibilityForViewer } from '@/server/repositories/activityEvents'
import type { OrgContext } from '@/lib/types'

export interface ClientHit {
  id: string
  name: string
  industry: string | null
  location: string | null
  matchedField: 'name' | 'summary' | 'voice' | 'meta'
  snippet: string | null
}
export interface PostHit {
  id: string
  clientId: string
  clientName: string
  contentRunId: string
  postDate: Date
  caption: string
  hashtags: string[]
}
export interface RunHit {
  id: string
  clientId: string
  clientName: string
  targetMonth: string
  status: string
}
export interface CommentHit {
  id: string
  clientId: string
  clientName: string
  body: string
  createdAt: Date
  actorName: string | null
}
export interface SearchResults {
  query: string
  total: number
  clients: ClientHit[]
  posts: PostHit[]
  runs: RunHit[]
  comments: CommentHit[]
}

const SECTION_LIMIT = 25

export async function searchAcrossEntities(
  ctx: OrgContext,
  rawQuery: string,
): Promise<SearchResults> {
  const query = rawQuery.trim()
  if (query.length < 2) {
    return { query, total: 0, clients: [], posts: [], runs: [], comments: [] }
  }

  const scopeFilter = getClientScopeFilter(ctx)
  const allowedVisibilities = visibilityForViewer(ctx)
  const ilike = `%${escapeIlike(query)}%`

  const [clients, posts, runs, comments] = await Promise.all([
    searchClients(ctx, ilike, scopeFilter),
    searchPosts(ctx, ilike, scopeFilter),
    searchRuns(ctx, ilike, scopeFilter),
    searchComments(ctx, ilike, scopeFilter, allowedVisibilities),
  ])

  return {
    query,
    total: clients.length + posts.length + runs.length + comments.length,
    clients,
    posts,
    runs,
    comments,
  }
}

async function searchClients(
  ctx: OrgContext,
  ilike: string,
  scopeFilter: Prisma.ClientWhereInput,
): Promise<ClientHit[]> {
  const rows = await db.client.findMany({
    where: {
      organizationId: ctx.organizationDbId,
      ...scopeFilter,
      OR: [
        { name: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { industry: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { location: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { businessSummary: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { brandVoice: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
      ],
    },
    take: SECTION_LIMIT,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      industry: true,
      location: true,
      businessSummary: true,
      brandVoice: true,
    },
  })

  const term = ilike.slice(1, -1).toLowerCase()
  return rows.map((c) => {
    let matchedField: ClientHit['matchedField'] = 'name'
    let snippet: string | null = null
    if (c.name.toLowerCase().includes(term)) {
      matchedField = 'name'
    } else if (
      c.businessSummary &&
      c.businessSummary.toLowerCase().includes(term)
    ) {
      matchedField = 'summary'
      snippet = excerpt(c.businessSummary, term)
    } else if (c.brandVoice && c.brandVoice.toLowerCase().includes(term)) {
      matchedField = 'voice'
      snippet = excerpt(c.brandVoice, term)
    } else {
      matchedField = 'meta'
    }
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      location: c.location,
      matchedField,
      snippet,
    }
  })
}

async function searchPosts(
  ctx: OrgContext,
  ilike: string,
  scopeFilter: Prisma.ClientWhereInput,
): Promise<PostHit[]> {
  const rows = await db.post.findMany({
    where: {
      client: {
        organizationId: ctx.organizationDbId,
        ...scopeFilter,
      },
      OR: [
        { caption: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { hashtags: { has: stripHash(ilike.slice(1, -1)) } },
        { graphicHook: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { designerNotes: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
      ],
    },
    take: SECTION_LIMIT,
    orderBy: { postDate: 'desc' },
    select: {
      id: true,
      clientId: true,
      contentRunId: true,
      postDate: true,
      caption: true,
      hashtags: true,
      client: { select: { name: true } },
    },
  })
  return rows.map((p) => ({
    id: p.id,
    clientId: p.clientId,
    clientName: p.client.name,
    contentRunId: p.contentRunId,
    postDate: p.postDate,
    caption: p.caption,
    hashtags: p.hashtags,
  }))
}

async function searchRuns(
  ctx: OrgContext,
  ilike: string,
  scopeFilter: Prisma.ClientWhereInput,
): Promise<RunHit[]> {
  const rows = await db.contentRun.findMany({
    where: {
      client: {
        organizationId: ctx.organizationDbId,
        ...scopeFilter,
      },
      OR: [
        { targetMonth: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { brief: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
        { supportingFacts: { contains: ilike.slice(1, -1), mode: 'insensitive' } },
      ],
    },
    take: SECTION_LIMIT,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      clientId: true,
      targetMonth: true,
      status: true,
      client: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    targetMonth: r.targetMonth,
    status: r.status,
  }))
}

async function searchComments(
  ctx: OrgContext,
  ilike: string,
  scopeFilter: Prisma.ClientWhereInput,
  allowedVisibilities: EventVisibility[],
): Promise<CommentHit[]> {
  // Comments live in ActivityEvent.payload (jsonb). Filter on the payload
  // body via Prisma's StringFilter on jsonb path.
  const rows = await db.activityEvent.findMany({
    where: {
      kind: 'comment',
      visibility: { in: allowedVisibilities },
      client: {
        organizationId: ctx.organizationDbId,
        ...scopeFilter,
      },
      payload: {
        path: ['body'],
        string_contains: ilike.slice(1, -1),
      },
    },
    take: SECTION_LIMIT,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      clientId: true,
      createdAt: true,
      payload: true,
      actor: { select: { name: true } },
      client: { select: { name: true } },
    },
  })
  return rows
    .map((e): CommentHit | null => {
      const body =
        typeof e.payload === 'object' && e.payload && 'body' in e.payload
          ? String((e.payload as { body: unknown }).body ?? '')
          : ''
      if (!body) return null
      return {
        id: e.id,
        clientId: e.clientId,
        clientName: e.client.name,
        body,
        createdAt: e.createdAt,
        actorName: e.actor?.name ?? null,
      }
    })
    .filter((x): x is CommentHit => x !== null)
}

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`)
}

function stripHash(s: string): string {
  return s.startsWith('#') ? s.slice(1) : s
}

function excerpt(haystack: string, needle: string, padding = 40): string {
  const lower = haystack.toLowerCase()
  const idx = lower.indexOf(needle.toLowerCase())
  if (idx === -1) return haystack.slice(0, 120)
  const from = Math.max(0, idx - padding)
  const to = Math.min(haystack.length, idx + needle.length + padding)
  return `${from > 0 ? '…' : ''}${haystack.slice(from, to)}${to < haystack.length ? '…' : ''}`
}

import { NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import { findClientForUser } from '@/server/repositories/clients'
import { visibilityForViewer } from '@/server/repositories/activityEvents'
import { parseDateScope } from '@/lib/date-scope'
import { db } from '@/db/client'

/**
 * Cheap "is there anything new?" endpoint for the live activity thread.
 * Returns only the newest visible event id for the client, scoped to the same
 * date range the page uses (parsed from the same scope/from/to query params).
 * The client poller compares it against what the server last rendered and soft
 * refreshes only when it changes. One indexed row, no payload — kept tiny so
 * polling it every few seconds is negligible.
 */
export interface ActivityLatestDTO {
  latestId: string | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx
  try {
    ctx = await requireOrgContext()
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  // Scope to clients this viewer may access (admin: all; AM/designer: assigned;
  // client: linked). Null means no access to this client.
  const client = await findClientForUser(ctx, id)
  if (!client) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  const sp = req.nextUrl.searchParams
  const dateScope = parseDateScope({
    scope: sp.get('scope'),
    from: sp.get('from'),
    to: sp.get('to'),
  })
  // Mirror listActivityForClient's createdAt bounds so the newest-in-scope id
  // matches what the page rendered (no spurious refresh on historical scopes).
  const createdAt: { gte?: Date; lt?: Date } = {}
  if (dateScope.from) createdAt.gte = dateScope.from
  if (dateScope.to) createdAt.lt = dateScope.to

  const latest = await db.activityEvent.findFirst({
    where: {
      clientId: id,
      visibility: { in: visibilityForViewer(ctx) },
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  return Response.json({ latestId: latest?.id ?? null } satisfies ActivityLatestDTO)
}

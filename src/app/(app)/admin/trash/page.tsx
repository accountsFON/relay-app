import { requireAdminPortal } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import { PageHeader } from '@/components/page-header'
import { AdminTabs } from '../admin-tabs'
import type { TrashRow } from '@/components/admin/trash-table'
import { TrashTabsClient } from './trash-tabs-client'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntilPurge(deletedAt: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const msSince = Date.now() - deletedAt.getTime()
  const daysSince = Math.floor(msSince / msPerDay)
  return Math.max(0, 30 - daysSince)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * /admin/trash — Org-Admin-only page that shows all soft-deleted entities
 * across 4 tabs (Clients, Batches, Runs, Posts). Admins can:
 *   - Restore: undo the soft-delete
 *   - Permanently delete (single): typed-confirm with entity label
 *   - Permanently delete (bulk): typed-confirm with count
 *
 * Permission gate: requireAdminPortal() (admin.portal key — admin role only).
 * Data loading uses the two-query pattern (onlyArchived() bare + separate user
 * lookups) to avoid the soft-delete proxy + include incompatibility.
 */
export default async function AdminTrashPage() {
  const ctx = await requireAdminPortal()
  const orgId = ctx.organizationDbId

  // -------------------------------------------------------------------------
  // Load archived entities (no include — two-query pattern for safety)
  // -------------------------------------------------------------------------

  const [archivedClients, archivedBatches, archivedRuns, archivedPosts] =
    await Promise.all([
      db.client.onlyArchived().findMany({
        where: { organizationId: orgId },
        orderBy: { deletedAt: 'desc' },
      }),
      db.batch.onlyArchived().findMany({
        where: { client: { organizationId: orgId } },
        orderBy: { deletedAt: 'desc' },
      }),
      db.contentRun.onlyArchived().findMany({
        where: { client: { organizationId: orgId } },
        orderBy: { deletedAt: 'desc' },
      }),
      db.post.onlyArchived().findMany({
        where: { client: { organizationId: orgId } },
        orderBy: { deletedAt: 'desc' },
      }),
    ])

  // -------------------------------------------------------------------------
  // Resolve archivedBy user names in one batch
  // -------------------------------------------------------------------------

  const allDeletedByIds = [
    ...archivedClients.map((r) => r.deletedBy),
    ...archivedBatches.map((r) => r.deletedBy),
    ...archivedRuns.map((r) => r.deletedBy),
    ...archivedPosts.map((r) => r.deletedBy),
  ].filter((id): id is string => !!id)

  const uniqueUserIds = [...new Set(allDeletedByIds)]
  const usersById = new Map<string, string>()

  if (uniqueUserIds.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, name: true },
    })
    for (const u of users) {
      usersById.set(u.id, u.name)
    }
  }

  // -------------------------------------------------------------------------
  // Resolve parent client names for Batches and Runs
  // -------------------------------------------------------------------------

  const allParentClientIds = [
    ...new Set([
      ...archivedBatches.map((b) => b.clientId),
      ...archivedRuns.map((r) => r.clientId),
    ]),
  ]

  const clientNamesById = new Map<string, string>()
  if (allParentClientIds.length > 0) {
    const clients = await db.client.withArchived().findMany({
      where: { id: { in: allParentClientIds } },
      select: { id: true, name: true },
    })
    for (const c of clients) {
      clientNamesById.set(c.id, c.name)
    }
  }

  // -------------------------------------------------------------------------
  // Map to TrashRow[]
  // -------------------------------------------------------------------------

  function resolveArchivedBy(deletedBy: string | null): string | null {
    if (!deletedBy) return null
    return usersById.get(deletedBy) ?? deletedBy
  }

  const clientRows: TrashRow[] = archivedClients.map((c) => ({
    id: c.id,
    label: c.name,
    archivedBy: resolveArchivedBy(c.deletedBy),
    archivedAt: c.deletedAt!.toISOString(),
    daysUntilPurge: daysUntilPurge(c.deletedAt!),
  }))

  const batchRows: TrashRow[] = archivedBatches.map((b) => {
    const clientName = clientNamesById.get(b.clientId)
    const label = clientName ? `${b.label} (${clientName})` : b.label
    return {
      id: b.id,
      label,
      archivedBy: resolveArchivedBy(b.deletedBy),
      archivedAt: b.deletedAt!.toISOString(),
      daysUntilPurge: daysUntilPurge(b.deletedAt!),
    }
  })

  const runRows: TrashRow[] = archivedRuns.map((r) => {
    const clientName = clientNamesById.get(r.clientId)
    const label = clientName
      ? `${r.targetMonth} run (${clientName})`
      : `${r.targetMonth} run`
    return {
      id: r.id,
      label,
      archivedBy: resolveArchivedBy(r.deletedBy),
      archivedAt: r.deletedAt!.toISOString(),
      daysUntilPurge: daysUntilPurge(r.deletedAt!),
    }
  })

  const postRows: TrashRow[] = archivedPosts.map((p) => {
    const captionSnippet =
      p.caption.length > 40 ? `${p.caption.slice(0, 40)}…` : p.caption
    const postDateLabel = p.postDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    return {
      id: p.id,
      label: `Post ${postDateLabel} — ${captionSnippet}`,
      archivedBy: resolveArchivedBy(p.deletedBy),
      archivedAt: p.deletedAt!.toISOString(),
      daysUntilPurge: daysUntilPurge(p.deletedAt!),
    }
  })

  // -------------------------------------------------------------------------
  // Build tab config for client component
  // -------------------------------------------------------------------------

  const tabs = [
    {
      key: 'clients',
      label: 'Clients',
      count: clientRows.length,
      rows: clientRows,
      entityType: 'client' as const,
    },
    {
      key: 'batches',
      label: 'Relays',
      count: batchRows.length,
      rows: batchRows,
      entityType: 'batch' as const,
    },
    {
      key: 'runs',
      label: 'Runs',
      count: runRows.length,
      rows: runRows,
      entityType: 'contentRun' as const,
    },
    {
      key: 'posts',
      label: 'Posts',
      count: postRows.length,
      rows: postRows,
      entityType: 'post' as const,
    },
  ]

  const totalCount =
    clientRows.length + batchRows.length + runRows.length + postRows.length

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Trash"
        description={
          totalCount === 0
            ? 'No archived items. Items are permanently deleted after 30 days.'
            : `${totalCount} archived ${totalCount === 1 ? 'item' : 'items'}. Permanently deleted after 30 days.`
        }
      />

      <div className="mt-6">
        <AdminTabs />
      </div>

      <div className="mt-10">
        <TrashTabsClient tabs={tabs} />
      </div>
    </div>
  )
}

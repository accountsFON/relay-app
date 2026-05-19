import { db } from '@/db/client'
import type { ClientStatus, OrgContext, UserRole } from '@/lib/types'
import { getClientScopeFilter } from '@/server/auth/scope'
import { can } from '@/server/auth/permissions'
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'

/**
 * Admin-only: returns a client by id within the org, ignoring assignment scoping.
 * Use this in /admin/* surfaces only. Everywhere else, prefer findClientForUser.
 */
export async function findClientById(id: string, organizationId: string) {
  return db.client.findFirst({
    where: { id, organizationId },
  })
}

/**
 * Admin-only: lists every client in the org. Use only in admin portal.
 * Everywhere else, prefer listClientsForUser.
 */
export async function listClientsByOrg(
  organizationId: string,
  filters?: { status?: ClientStatus }
) {
  return db.client.findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { name: 'asc' },
  })
}

/**
 * Returns the single client by id, scoped both to the user's org AND their
 * assignment scope. AMs only see clients where they're assigned AM; designers
 * only see clients where they're assigned designer; clients only see their
 * linked client. Returns null if the client doesn't exist or the user lacks
 * scope (caller should call notFound() on null to avoid existence leaks).
 */
export async function findClientForUser(ctx: OrgContext, id: string) {
  // withArchived() so the client page still loads when the client is soft-deleted.
  return db.client.withArchived().findFirst({
    where: {
      id,
      organizationId: ctx.organizationDbId,
      ...getClientScopeFilter(ctx),
    },
  })
}

/**
 * Lists all clients the user is allowed to see, ordered by name.
 * Admin: all org clients. AM/Designer: only their assignments. Client: only
 * their single linked client (or none if unlinked).
 */
export async function listClientsForUser(
  ctx: OrgContext,
  filters?: { status?: ClientStatus; showArchived?: boolean },
) {
  const base = filters?.showArchived ? db.client.withArchived() : db.client
  return base.findMany({
    where: {
      organizationId: ctx.organizationDbId,
      ...getClientScopeFilter(ctx),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { name: 'asc' },
  })
}

type CreateClientInput = {
  organizationId: string
  name: string
  businessSummary?: string
  brandVoice?: string
  industry?: string
  location?: string
  phone?: string
  mainCta?: string
  focus1?: string
  focus2?: string
  focus3?: string
  dos?: string
  donts?: string
  postingDays: string
  postLength?: string
  urls: string[]
  targetAudience?: string
  holidayHandling: string
  excludedDates: string[]
  assetsFolderUrl?: string
  canvaUrl?: string
  autoCrawl?: string
  assignedAmId?: string
  status: ClientStatus
  clientReviewEnabled?: boolean
}

export async function createClient(input: CreateClientInput) {
  return db.client.create({ data: input })
}

type UpdateClientData = Partial<{
  name: string
  businessSummary: string
  brandVoice: string
  industry: string
  location: string
  phone: string
  mainCta: string
  focus1: string
  focus2: string
  focus3: string
  dos: string
  donts: string
  postingDays: string
  postLength: string
  urls: string[]
  targetAudience: string
  holidayHandling: string
  excludedDates: string[]
  assetsFolderUrl: string
  canvaUrl: string
  autoCrawl: string
  assignedAmId: string
  status: ClientStatus
  clientReviewEnabled: boolean
}>

export async function updateClient(
  id: string,
  organizationId: string,
  data: UpdateClientData
) {
  return db.client.updateMany({
    where: { id, organizationId },
    data,
  })
}

/**
 * Sets the client's status to `ClientStatus.archived` (enum value `'archived'`).
 * This is a status-change operation, NOT a soft-delete. It does not touch
 * `deletedAt` and does not cascade to child records.
 *
 * Use `archiveClient` (the trash soft-delete) for the full soft-delete flow.
 */
export async function deactivateClient(id: string, organizationId: string) {
  return db.client.updateMany({
    where: { id, organizationId },
    data: { status: 'archived' },
  })
}

/** Admin-only: lists all clients in the org with their assigned AM and designer (id+name only). */
export async function listClientsByOrgWithAssignments(organizationId: string) {
  return db.client.findMany({
    where: { organizationId },
    include: {
      assignedAm: { select: { id: true, name: true } },
      assignedDesigner: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })
}

/** Admin-only: set or clear the AM assignment on a client. Pass null to unassign. */
export async function assignClientAm(
  id: string,
  organizationId: string,
  amUserId: string | null,
) {
  const result = await db.client.updateMany({
    where: { id, organizationId },
    data: { assignedAmId: amUserId },
  })
  if (result.count === 0) {
    throw new Error('Client not found in this organization')
  }
  return result
}

/** Admin-only: set or clear the Designer assignment on a client. Pass null to unassign. */
export async function assignClientDesigner(
  id: string,
  organizationId: string,
  designerUserId: string | null,
) {
  const result = await db.client.updateMany({
    where: { id, organizationId },
    data: { assignedDesignerId: designerUserId },
  })
  if (result.count === 0) {
    throw new Error('Client not found in this organization')
  }
  return result
}

// ---------------------------------------------------------------------------
// Trash: archive / restore
// ---------------------------------------------------------------------------

/**
 * Checks that `actorUserId` holds an org membership with `client.edit`
 * permission. `client.edit` is the appropriate key for soft-deleting a Client
 * — it covers admins and account managers while excluding designers and
 * client-role users, matching the intended gatekeeping.
 */
async function assertCanEditClient(
  actorUserId: string,
  organizationId: string,
): Promise<void> {
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: actorUserId, organizationId } },
  })
  if (!membership) {
    throw new Error(
      `Not authorized: user ${actorUserId} has no membership in organization ${organizationId}`,
    )
  }
  const allowed = can(
    {
      role: membership.role as UserRole,
      permissionOverrides:
        (membership.permissionOverrides as Record<string, boolean> | null) ?? null,
    },
    'client.edit',
  )
  if (!allowed) {
    throw new Error(
      `Forbidden: user ${actorUserId} (role: ${membership.role}) does not have client.edit permission`,
    )
  }
}

export interface ClientArchiveInput {
  clientId: string
  actorUserId: string
}

/**
 * Soft-deletes a Client and cascades to all its live Batches, ContentRuns,
 * and Posts in a single transaction.
 *
 * Client has direct foreign keys to all three child types (clientId on Batch,
 * ContentRun, and Post), so a single updateMany filter on clientId is
 * sufficient — no indirection through Posts is needed.
 *
 * All four layers share the same `deletedAt` timestamp so a restore can undo
 * all of them with a single timestamp filter.
 *
 * A TrashAuditLog entry is written with
 * `cascadeCount = 1 + batchCount + runCount + postCount`.
 */
export async function archiveClient({
  clientId,
  actorUserId,
}: ClientArchiveInput): Promise<void> {
  // Two-query pattern: withArchived() + include causes a Prisma invocation
  // error, so we fetch the client bare and the org separately.
  const client = await db.client.withArchived().findFirst({ where: { id: clientId } })
  if (!client) throw new Error(`Client ${clientId} not found`)
  if (client.deletedAt) throw new Error(`Client ${clientId} is already archived`)

  const organizationId = client.organizationId
  await assertCanEditClient(actorUserId, organizationId)

  // Pre-fetch counts before the transaction so cascadeCount is accurate.
  const [batchCount, runCount, postCount] = await Promise.all([
    db.batch.count({ where: { clientId, deletedAt: null } }),
    db.contentRun.count({ where: { clientId, deletedAt: null } }),
    db.post.count({ where: { clientId, deletedAt: null } }),
  ])

  const now = new Date()
  await db.$transaction(async (tx) => {
    // Stamp the client itself.
    await tx.client.update({
      where: { id: clientId },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    // Stamp all live Batches for this client.
    await tx.batch.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    // Stamp all live ContentRuns for this client.
    await tx.contentRun.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    // Stamp all live Posts for this client.
    await tx.post.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'archive',
      entityType: 'client',
      entityId: clientId,
      parentContext: {},
      cascadeCount: 1 + batchCount + runCount + postCount,
    })
  })
}

/**
 * Restores a soft-deleted Client using timestamp-aware restore on all three
 * cascaded layers (Batch, ContentRun, Post).
 *
 * Only rows whose `deletedAt` matches the client's prior `deletedAt` timestamp
 * are cleared — rows archived independently at a different timestamp are left
 * alone (they were archived by a separate intent).
 */
export async function restoreClient({
  clientId,
  actorUserId,
}: ClientArchiveInput): Promise<void> {
  // Two-query pattern — same reason as archiveClient.
  const client = await db.client.withArchived().findFirst({ where: { id: clientId } })
  if (!client) throw new Error(`Client ${clientId} not found`)
  if (!client.deletedAt) throw new Error(`Client ${clientId} is not archived`)

  const organizationId = client.organizationId
  await assertCanEditClient(actorUserId, organizationId)

  const priorDeletedAt = client.deletedAt

  await db.$transaction(async (tx) => {
    // Restore the client.
    await tx.client.update({
      where: { id: clientId },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore only Batches archived at the cascade timestamp.
    const { count: batchCount } = await tx.batch.updateMany({
      where: { clientId, deletedAt: priorDeletedAt },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore only ContentRuns archived at the cascade timestamp.
    const { count: runCount } = await tx.contentRun.updateMany({
      where: { clientId, deletedAt: priorDeletedAt },
      data: { deletedAt: null, deletedBy: null },
    })

    // Restore only Posts archived at the cascade timestamp.
    const { count: postCount } = await tx.post.updateMany({
      where: { clientId, deletedAt: priorDeletedAt },
      data: { deletedAt: null, deletedBy: null },
    })

    await writeTrashAudit(tx, {
      actorUserId,
      organizationId,
      action: 'restore',
      entityType: 'client',
      entityId: clientId,
      parentContext: {},
      cascadeCount: 1 + batchCount + runCount + postCount,
    })
  })
}

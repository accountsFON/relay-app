import { db } from '@/db/client'
import type { ClientStatus, OrgContext } from '@/lib/types'
import { getClientScopeFilter } from '@/server/auth/scope'

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
  return db.client.findFirst({
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
  filters?: { status?: ClientStatus },
) {
  return db.client.findMany({
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
  autoCrawl?: string
  assignedAmId?: string
  status: ClientStatus
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
  autoCrawl: string
  assignedAmId: string
  status: ClientStatus
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

export async function archiveClient(id: string, organizationId: string) {
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
  return db.client.updateMany({
    where: { id, organizationId },
    data: { assignedAmId: amUserId },
  })
}

/** Admin-only: set or clear the Designer assignment on a client. Pass null to unassign. */
export async function assignClientDesigner(
  id: string,
  organizationId: string,
  designerUserId: string | null,
) {
  return db.client.updateMany({
    where: { id, organizationId },
    data: { assignedDesignerId: designerUserId },
  })
}

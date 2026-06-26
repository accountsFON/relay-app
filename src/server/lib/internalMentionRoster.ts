import { db } from '@/db/client'
import { handleFromName, type MentionTarget } from '@/lib/mentions'

/**
 * Build the internal @-mention roster for a client: the assigned AM + assigned
 * designer + every admin in the client's org, deduped by id, internal users
 * only (never a `client`-role user). Returns the same `{ id, name, handle }`
 * shape `buildMentionRoster` produces so the composer + `resolveMentionedUserIds`
 * reuse the existing mention machinery unchanged.
 *
 * Spec: projects/relay-app/2026-06-26-internal-review-notifications-design.md
 *       § 1. Mention roster for a client (internal)
 */
export async function internalMentionRosterForClient(
  clientId: string,
): Promise<MentionTarget[]> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { assignedAmId: true, assignedDesignerId: true, organizationId: true },
  })
  if (!client) return []

  const assigneeIds = [client.assignedAmId, client.assignedDesignerId].filter(
    (id): id is string => Boolean(id),
  )

  // One query: every admin in the org PLUS the two assignees (whatever their
  // role). The `role: { not: 'client' }` guard drops client-role users even if
  // an assignee somehow is one.
  const users = await db.user.findMany({
    where: {
      organizationId: client.organizationId,
      role: { not: 'client' },
      OR: [{ role: 'admin' }, { id: { in: assigneeIds } }],
    },
    select: { id: true, name: true, role: true },
  })

  const seen = new Set<string>()
  const roster: MentionTarget[] = []
  for (const u of users) {
    // Defensive: never ping a client-role user even if one slips through.
    if (u.role === 'client') continue
    if (seen.has(u.id)) continue
    seen.add(u.id)
    roster.push({ id: u.id, name: u.name, handle: handleFromName(u.name) })
  }
  return roster
}

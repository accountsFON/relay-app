/**
 * Activity server actions: Caleb-owned write surface for the comms layer.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § API surface
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 2
 *
 * Boundary:
 * - Comments are the one write surface Caleb owns end-to-end.
 * - postCommentAction calls Rails's recordActivity() helper so comments
 *   share the same write path as relay state events.
 * - State changes go through Rails's actions in src/server/actions/relay.ts.
 */
'use server'

import { revalidatePath } from 'next/cache'
import { ActivityKind } from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import { requireOrgContext } from '@/server/middleware/auth'
import { findClientForUser } from '@/server/repositories/clients'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { recordActivity } from '@/server/services/activity'
import { markMentionRead as markMentionReadRepo } from '@/server/repositories/activityEvents'
import {
  buildMentionRoster,
  resolveMentionedUserIds,
} from '@/lib/mentions'

export interface PostCommentInput {
  clientId: string
  body: string
  /** Optional override; if omitted, server parses @handles from body. */
  mentionedUserIds?: string[]
}

export async function postCommentAction(
  input: PostCommentInput,
): Promise<{ id: string | null }> {
  const trimmed = input.body?.trim() ?? ''
  if (trimmed.length === 0) {
    throw new Error('Comment body cannot be empty')
  }

  // Gate on the narrow client.comment permission (admin / AM / designer), NOT
  // client.edit. Designers must be able to post internal @-mention pings even
  // though they can't edit clients/posts. Clients never get client.comment, so
  // they still cannot post here. Comments stay internal (default visibility).
  const ctx = await requireCan('client.comment')

  // Verify client visibility before writing. Spec § Permission scoping
  // piggybacks on findClientForUser; without this check, a malicious caller
  // could write a comment to any client they have an org membership for.
  const client = await findClientForUser(ctx, input.clientId)
  if (!client) {
    throw new Error('Client not found or not visible to user')
  }

  // Resolve @handles from body unless caller passed them in.
  let mentionedUserIds = input.mentionedUserIds ?? []
  if (mentionedUserIds.length === 0) {
    const memberships = await listMembershipsForOrg(ctx.organizationDbId)
    const roster = buildMentionRoster(memberships)
    mentionedUserIds = resolveMentionedUserIds(trimmed, roster)
  }

  const result = await recordActivity({
    clientId: client.id,
    actorId: ctx.userDbId,
    kind: ActivityKind.comment,
    payload: {
      kind: 'comment',
      body: trimmed,
      mentionedUserIds,
    },
    mentionedUserIds,
  })

  revalidatePath(`/clients/${client.id}`)
  return { id: result?.id ?? null }
}

export async function markMentionReadAction(mentionId: string): Promise<void> {
  const ctx = await requireOrgContext()
  await markMentionReadRepo(mentionId, ctx.userDbId)
  revalidatePath('/inbox')
}

export async function markAllMentionsReadAction(): Promise<void> {
  const ctx = await requireOrgContext()
  await db.mention.updateMany({
    where: { mentionedUserId: ctx.userDbId, readAt: null },
    data: { readAt: new Date() },
  })
  revalidatePath('/inbox')
}

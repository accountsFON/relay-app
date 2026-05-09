'use server'

import { revalidatePath } from 'next/cache'
import { ActivityKind } from '@prisma/client'
import { db } from '@/db/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { requireOrgContext } from '@/server/middleware/auth'
import { recordActivity } from '@/server/services/activity'
import {
  markMentionRead as markMentionReadRepo,
} from '@/server/repositories/activityEvents'
import { extractHandles, userNameToHandle } from '@/lib/mention-parser'

export interface PostCommentInput {
  clientId: string
  body: string
  /** Optional override; if omitted, server parses @handles from body. */
  mentionedUserIds?: string[]
}

export async function postCommentAction(
  input: PostCommentInput,
): Promise<{ id: string | null }> {
  if (!input.body || input.body.trim().length === 0) {
    throw new Error('Comment body cannot be empty')
  }
  const ctx = await requireClientEditor()

  // Resolve @handles from body unless caller passed them in.
  let mentionedUserIds = input.mentionedUserIds ?? []
  if (mentionedUserIds.length === 0) {
    const handles = extractHandles(input.body)
    if (handles.length > 0) {
      const memberships = await db.membership.findMany({
        where: { organizationId: ctx.organizationDbId },
        include: { user: { select: { id: true, name: true } } },
      })
      const byHandle = new Map<string, string>()
      for (const m of memberships) {
        byHandle.set(userNameToHandle(m.user.name), m.user.id)
      }
      mentionedUserIds = handles
        .map((h) => byHandle.get(h))
        .filter((u): u is string => Boolean(u))
    }
  }

  const result = await recordActivity({
    clientId: input.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.comment,
    payload: {
      body: input.body,
      mentionedUserIds,
    },
    mentionedUserIds,
  })

  revalidatePath(`/clients/${input.clientId}`)
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

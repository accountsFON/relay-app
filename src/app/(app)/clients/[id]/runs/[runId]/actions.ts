'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { recordActivity, ActivityKind } from '@/server/services/activity'

export async function updatePostAction(
  postId: string,
  data: {
    caption?: string
    hashtags?: string[]
    graphicHook?: string | null
    designerNotes?: string | null
  }
) {
  const ctx = await requireClientEditor()

  const before = await findPostById(postId)
  await updatePost(postId, data)

  if (before) {
    const fieldsChanged: string[] = []
    if (data.caption !== undefined && data.caption !== before.caption) {
      fieldsChanged.push('caption')
    }
    if (
      data.hashtags !== undefined &&
      (data.hashtags.length !== before.hashtags.length ||
        data.hashtags.some((h, i) => h !== before.hashtags[i]))
    ) {
      fieldsChanged.push('hashtags')
    }
    if (
      data.graphicHook !== undefined &&
      data.graphicHook !== before.graphicHook
    ) {
      fieldsChanged.push('graphicHook')
    }
    if (
      data.designerNotes !== undefined &&
      data.designerNotes !== before.designerNotes
    ) {
      fieldsChanged.push('designerNotes')
    }

    if (fieldsChanged.length > 0) {
      await recordActivity({
        clientId: before.clientId,
        runId: before.contentRunId,
        postId,
        actorId: ctx.userDbId,
        kind: ActivityKind.post_edited,
        payload: { fieldsChanged },
      })
    }
  }

  revalidatePath('/', 'layout')
}

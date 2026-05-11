'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import {
  snapshotPostVersion,
  findVersion,
} from '@/server/services/postVersions'

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
  if (!before) return

  // Snapshot the prior body BEFORE the update so we can restore to it.
  await snapshotPostVersion({
    postId,
    authorId: ctx.userDbId,
    body: {
      caption: before.caption,
      hashtags: before.hashtags,
      graphicHook: before.graphicHook,
      designerNotes: before.designerNotes,
    },
  })

  await updatePost(postId, data)

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

  revalidatePath('/', 'layout')
}

/**
 * Restore a post to a prior PostVersion. Per spec: restoring creates a new
 * save (history is append-only). Snapshots the current body first, then
 * applies the restored body.
 */
export async function restorePostVersionAction(versionId: string) {
  const ctx = await requireClientEditor()
  const version = await findVersion(versionId)
  if (!version) throw new Error('Post version not found')

  const current = await findPostById(version.postId)
  if (!current) throw new Error('Post not found')

  await snapshotPostVersion({
    postId: version.postId,
    authorId: ctx.userDbId,
    body: {
      caption: current.caption,
      hashtags: current.hashtags,
      graphicHook: current.graphicHook,
      designerNotes: current.designerNotes,
    },
  })

  await updatePost(version.postId, {
    caption: version.caption,
    hashtags: version.hashtags,
    graphicHook: version.graphicHook,
    designerNotes: version.designerNotes,
  })

  await recordActivity({
    clientId: current.clientId,
    runId: current.contentRunId,
    postId: version.postId,
    actorId: ctx.userDbId,
    kind: ActivityKind.post_edited,
    payload: {
      fieldsChanged: ['caption', 'hashtags', 'graphicHook', 'designerNotes'],
      restoredFromVersionId: version.id,
    },
  })

  revalidatePath('/', 'layout')
}

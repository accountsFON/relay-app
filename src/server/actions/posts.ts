'use server'

import { revalidatePath } from 'next/cache'
import { diffFieldChanges } from '@/lib/field-changes'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findPostById, updatePost } from '@/server/repositories/posts'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import {
  snapshotPostVersion,
  findVersion,
} from '@/server/services/postVersions'
import { redoPostCaption } from '@/server/services/redoPost'
import { assertBatchEditable } from '@/server/lib/relay-lock-guard'

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

  // findPostById is now per-client scoped: returns null unless the post's
  // client is within the actor's scope. Treat null as "post does not exist"
  // (404 semantics) to avoid leaking existence across org or client boundaries.
  const before = await findPostById(postId, ctx)
  if (!before) return
  await assertBatchEditable(before.batchId)

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

  // updatePost is also scoped via assertCanEditPost as defense in depth.
  // Since `before` is non-null above, this should not throw under normal
  // flow; a throw here would indicate a race or an exotic membership state.
  await updatePost(postId, data, ctx.userDbId)

  const changes = diffFieldChanges(
    {
      caption: before.caption,
      hashtags: before.hashtags,
      graphicHook: before.graphicHook,
      designerNotes: before.designerNotes,
    },
    {
      caption: data.caption,
      hashtags: data.hashtags,
      graphicHook: data.graphicHook,
      designerNotes: data.designerNotes,
    },
  )
  if (changes.length > 0) {
    await recordActivity({
      clientId: before.clientId,
      runId: before.contentRunId,
      postId,
      actorId: ctx.userDbId,
      kind: ActivityKind.post_edited,
      payload: { changes },
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

  // Scope-check the post before reading or writing. If the actor has no
  // membership in the post's org, treat it as "not found" (404 semantics
  // matching findClientForUser).
  const current = await findPostById(version.postId, ctx)
  if (!current) throw new Error('Post not found')
  await assertBatchEditable(current.batchId)

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

  await updatePost(
    version.postId,
    {
      caption: version.caption,
      hashtags: version.hashtags,
      graphicHook: version.graphicHook,
      designerNotes: version.designerNotes,
    },
    ctx.userDbId,
  )

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

/**
 * Per-post AI redo. Regenerates the caption + hashtags + graphic hook +
 * designer notes for a single post using the same brief / facts the
 * original run had. Snapshots the prior body via PostVersion so the AM
 * can restore if the redo is worse.
 *
 * Scope check via findPostById; the service trusts the caller's gate.
 * post_edited activity event records the redo with `aiRedo: true`.
 */
export async function redoPostAction(postId: string) {
  const ctx = await requireClientEditor()

  const before = await findPostById(postId, ctx)
  if (!before) throw new Error('Post not found')
  await assertBatchEditable(before.batchId)

  const result = await redoPostCaption({
    postId,
    actorUserId: ctx.userDbId,
  })

  await recordActivity({
    clientId: before.clientId,
    runId: before.contentRunId,
    postId,
    actorId: ctx.userDbId,
    kind: ActivityKind.post_edited,
    payload: {
      fieldsChanged: ['caption', 'hashtags', 'graphicHook', 'designerNotes'],
      aiRedo: true,
      postVersionId: result.postVersionId || undefined,
      costUsd: result.costUsd,
    },
  })

  revalidatePath('/', 'layout')
  return { postVersionId: result.postVersionId, newCaption: result.newCaption }
}

'use server'

/**
 * Server actions for the trash system — archive, restore, and purge.
 *
 * All nine actions are co-located here so the trash surface area is contained.
 * Archive/restore actions require `client.edit` permission (admin + AM).
 * The purge action requires `admin.portal` permission (admin only).
 *
 * Auth pattern: use the existing requireClientEditor / requireCan helpers
 * which resolve the full OrgContext (including `userDbId`) from the Clerk
 * session. This is identical to the pattern used in every other actions.ts
 * file in the codebase.
 */

import { revalidatePath } from 'next/cache'
import { requireClientEditor, requireAdminPortal } from '@/server/middleware/permissions'
import { archivePost, restorePost } from '@/server/repositories/posts'
import {
  archiveContentRun,
  restoreContentRun,
} from '@/server/repositories/contentRuns'
import { archiveBatch, restoreBatch } from '@/server/repositories/batches'
import {
  archiveClient,
  restoreClient,
} from '@/server/repositories/clients'
import { purgeEntity } from '@/server/repositories/trashPurge'
import type { TrashEntityType } from '@/server/repositories/trashAuditLogs'

// ---------------------------------------------------------------------------
// Post archive / restore
// ---------------------------------------------------------------------------

export async function archivePostAction(postId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await archivePost({ postId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
}

export async function restorePostAction(postId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await restorePost({ postId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
  revalidatePath('/admin/trash')
}

// ---------------------------------------------------------------------------
// ContentRun archive / restore
// ---------------------------------------------------------------------------

export async function archiveContentRunAction(runId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await archiveContentRun({ runId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
  revalidatePath('/dashboard')
}

export async function restoreContentRunAction(runId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await restoreContentRun({ runId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/admin/trash')
}

// ---------------------------------------------------------------------------
// Batch archive / restore
// ---------------------------------------------------------------------------

export async function archiveBatchAction(batchId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await archiveBatch({ batchId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
  revalidatePath('/dashboard')
}

export async function restoreBatchAction(batchId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await restoreBatch({ batchId, actorUserId: ctx.userDbId })
  revalidatePath('/clients', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/admin/trash')
}

// ---------------------------------------------------------------------------
// Client archive / restore
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a client and cascades to all its live Batches, ContentRuns,
 * and Posts. This is the trash soft-delete — distinct from `deactivateClientAction`
 * in clients/actions.ts which calls `deactivateClient` (a status-change only).
 */
export async function archiveClientAction(clientId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await archiveClient({ clientId, actorUserId: ctx.userDbId })
  revalidatePath('/clients')
  revalidatePath('/dashboard')
}

export async function restoreClientAction(clientId: string): Promise<void> {
  const ctx = await requireClientEditor()
  await restoreClient({ clientId, actorUserId: ctx.userDbId })
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  revalidatePath('/admin/trash')
}

// ---------------------------------------------------------------------------
// Purge (permanent hard-delete) — admin only
// ---------------------------------------------------------------------------

export async function purgeEntityAction(
  entityType: TrashEntityType,
  entityId: string,
): Promise<void> {
  const ctx = await requireAdminPortal()
  await purgeEntity({ entityType, entityId, actorUserId: ctx.userDbId })
  revalidatePath('/admin/trash')
  revalidatePath('/clients')
  revalidatePath('/dashboard')
}

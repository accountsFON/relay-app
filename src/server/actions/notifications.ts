'use server'

import { db } from '@/db/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import {
  emitPreviewReviewSubmit,
  type SubmitPreviewReviewResult,
} from '@/server/services/preview-review-emit'

/**
 * Server actions backing the notification bell (Phase 1).
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 15, submitPreviewReviewAction + /preview Submit button
 *
 * submitPreviewReviewAction emits a `preview_review_submitted` ActivityEvent
 * with a designer Mention so the assigned designer's bell lights up the
 * moment the AM clicks "Submit" on the /preview page. The action is a
 * silent no-op when the AM has no unresolved comments authored on the
 * batch, no event, no mention. We never spam the designer with an empty
 * review summary.
 *
 * Security boundary:
 * - This file is the ONLY browser-reachable surface. `'use server'`
 *   exposes its async exports as RPCs, so every export here MUST resolve
 *   the actor from Clerk (no actorUserId-as-input spoofing seams) and
 *   verify tenant scoping before writing.
 * - The actual emit logic lives in `@/server/services/preview-review-emit`
 *   as a plain (non `'use server'`) helper, exported for integration tests.
 *   That helper does no auth, callers must scope first. The server action
 *   below does exactly that.
 */

export interface SubmitPreviewReviewInput {
  batchId: string
}

/**
 * Server action: only reachable from authenticated browsers via RPC.
 * Resolves the actor from Clerk via requireClientEditor() and verifies
 * tenant scoping (the batch's client must be visible to the caller per
 * findClientForUser) before delegating to emitPreviewReviewSubmit.
 *
 * requireClientEditor() handles auth + permission; findClientForUser
 * handles per-client scope (AM/designer/client-role visibility) plus org
 * membership. Together they reject cross-org batchIds.
 */
export async function submitPreviewReviewAction(
  input: SubmitPreviewReviewInput,
): Promise<SubmitPreviewReviewResult> {
  if (!input.batchId || typeof input.batchId !== 'string') {
    throw new Error('batchId required')
  }

  const ctx = await requireClientEditor()

  // Resolve the batch's owning client and verify the caller has scope on
  // it. Without this check, a malicious authenticated user could POST any
  // batchId and either leak comment counts on another org's posts or
  // write ActivityEvent + Mention rows scoped to another org's client.
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: { clientId: true },
  })
  if (!batch) throw new Error('Batch not found')

  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) {
    throw new Error('Batch not found or not visible to user')
  }

  return emitPreviewReviewSubmit({
    batchId: input.batchId,
    actorUserId: ctx.userDbId,
  })
}

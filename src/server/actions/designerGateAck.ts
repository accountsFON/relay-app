'use server'

import { revalidatePath } from 'next/cache'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findBatch } from '@/server/repositories/batches'
import { findClientForUser } from '@/server/repositories/clients'
import { upsertDesignerGateAck } from '@/server/repositories/designerGateAcks'

// Module-private: a 'use server' file may only export async functions.
class DesignerGateActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DesignerGateActionError'
  }
}

/** A designer confirms they reviewed the client profile + brand guide, unlocking the workspace for this relay. */
export async function acknowledgeDesignerGateAction(
  batchId: string,
): Promise<{ ok: true }> {
  const ctx = await requireClientViewer()
  if (ctx.role !== 'designer') {
    throw new DesignerGateActionError('Only designers acknowledge the onboarding gate')
  }

  const batch = await findBatch(batchId)
  if (!batch) throw new DesignerGateActionError('Relay not found')

  // Org-scopes the batch: findClientForUser only returns clients in the actor's org.
  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) throw new DesignerGateActionError('Relay not found')

  await upsertDesignerGateAck({
    organizationId: ctx.organizationDbId,
    batchId,
    userId: ctx.userDbId,
  })
  revalidatePath(`/clients/${client.id}/batches/${batchId}`)
  return { ok: true }
}

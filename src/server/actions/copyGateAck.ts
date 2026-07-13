'use server'

import { revalidatePath } from 'next/cache'
import { requireClientViewer } from '@/server/middleware/permissions'
import { findBatch } from '@/server/repositories/batches'
import { findClientForUser } from '@/server/repositories/clients'
import { upsertCopyGateAck } from '@/server/repositories/copyGateAcks'

// Module-private: a 'use server' file may only export async functions.
class CopyGateActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CopyGateActionError'
  }
}

/** An AM (or admin) confirms they reviewed the client profile, unlocking the copy workspace for this relay. */
export async function acknowledgeCopyGateAction(
  batchId: string,
): Promise<{ ok: true }> {
  const ctx = await requireClientViewer()
  if (ctx.role !== 'account_manager' && ctx.role !== 'admin') {
    throw new CopyGateActionError('Only account managers or admins acknowledge the copy-step onboarding gate')
  }

  const batch = await findBatch(batchId)
  if (!batch) throw new CopyGateActionError('Relay not found')

  // Org-scopes the batch: findClientForUser only returns clients in the actor's org.
  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) throw new CopyGateActionError('Relay not found')

  await upsertCopyGateAck({
    organizationId: ctx.organizationDbId,
    batchId,
    userId: ctx.userDbId,
  })
  revalidatePath(`/clients/${client.id}/batches/${batchId}`)
  return { ok: true }
}

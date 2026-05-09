'use server'

import { revalidatePath } from 'next/cache'
import type { RelayStep, RevisionItemType } from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import {
  completeRevisionItem,
  dispatchRevisions,
  passBaton,
  sendBackBaton,
} from '@/server/services/relay'

export async function passBatonAction(input: {
  batchId: string
  toStep: RelayStep
}) {
  const ctx = await requireCan('relay.pass')
  const result = await passBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    actorId: ctx.userDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function sendBackBatonAction(input: {
  batchId: string
  toStep: RelayStep
  reason: string
}) {
  const ctx = await requireCan('relay.sendBack')
  const result = await sendBackBaton({
    batchId: input.batchId,
    toStep: input.toStep,
    reason: input.reason,
    actorId: ctx.userDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function dispatchRevisionsAction(input: {
  batchId: string
  items: { type: RevisionItemType; description: string; assignedTo: string }[]
}) {
  const ctx = await requireCan('relay.composeRevisionPlan')
  const result = await dispatchRevisions({
    batchId: input.batchId,
    items: input.items,
    actorId: ctx.userDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function completeRevisionItemAction(input: { itemId: string }) {
  const ctx = await requireCan('relay.completeRevisionItem')
  const result = await completeRevisionItem({
    itemId: input.itemId,
    actorId: ctx.userDbId,
  })
  revalidatePath('/', 'layout')
  return result
}

export async function advanceCopySubStateAction(input: {
  batchId: string
  toSubState: 'generating' | 'drafted' | 'approved'
}) {
  const ctx = await requireCan('relay.pass')
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      currentStep: true,
      currentSubState: true,
      currentHolder: true,
    },
  })
  if (!batch) throw new Error('Batch not found')
  if (batch.currentStep !== 'copy') {
    throw new Error('Sub-state advance only valid at step copy')
  }
  if (batch.currentHolder !== ctx.userDbId && !ctx.platformOwner) {
    throw new Error('Only the current holder may advance sub-state')
  }
  if ((batch.currentSubState ?? 'generating') === input.toSubState) {
    return { ok: true as const, changed: false }
  }
  await db.batch.update({
    where: { id: batch.id },
    data: { currentSubState: input.toSubState },
  })
  revalidatePath('/', 'layout')
  return { ok: true as const, changed: true }
}

export async function tickChecklistItemAction(input: {
  itemId: string
  checked: boolean
}) {
  const ctx = await requireCan('relay.pass')
  const item = await db.checklistItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, batchId: true },
  })
  if (!item) throw new Error('Checklist item not found')
  const batch = await db.batch.findUnique({
    where: { id: item.batchId },
    select: { currentHolder: true, clientId: true },
  })
  if (!batch) throw new Error('Batch not found')
  if (batch.currentHolder !== ctx.userDbId && !ctx.platformOwner) {
    throw new Error('Only the current holder may tick checklist items')
  }

  await db.checklistItem.update({
    where: { id: item.id },
    data: input.checked
      ? { checked: true, checkedBy: ctx.userDbId, checkedAt: new Date() }
      : { checked: false, checkedBy: null, checkedAt: null },
  })
  revalidatePath(`/clients/${batch.clientId}/batches/${item.batchId}`)
  return { ok: true as const }
}

'use server'

import { revalidatePath } from 'next/cache'
import type { RelayStep, RevisionItemType } from '@prisma/client'
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

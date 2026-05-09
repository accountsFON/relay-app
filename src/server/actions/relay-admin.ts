'use server'

import { revalidatePath } from 'next/cache'
import { ActivityKind, RelayRole, RelayStep } from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import { recordActivity } from '@/server/services/activity'
import { reseedChecklistForStep } from '@/server/lib/relay-state-machine'

export async function nudgeStuckBatchAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.takeOver')
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: { id: true, clientId: true, currentHolder: true, currentStep: true },
  })
  if (!batch) throw new Error('Batch not found')

  await recordActivity({
    clientId: batch.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.batch_step_advanced,
    payload: {
      batchId: batch.id,
      reason: 'admin nudge',
      currentStep: batch.currentStep,
    },
    mentionedUserIds:
      batch.currentHolder !== ctx.userDbId ? [batch.currentHolder] : [],
  })
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function takeOverBatchAction(input: {
  batchId: string
  newHolderId: string
}) {
  const ctx = await requireCan('relay.takeOver')
  if (!input.newHolderId) throw new Error('newHolderId required')

  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      clientId: true,
      currentHolder: true,
      currentRole: true,
      currentStep: true,
    },
  })
  if (!batch) throw new Error('Batch not found')
  if (batch.currentHolder === input.newHolderId) {
    return { ok: true as const, changed: false }
  }

  await db.batch.update({
    where: { id: batch.id },
    data: { currentHolder: input.newHolderId },
  })

  await recordActivity({
    clientId: batch.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.batch_step_advanced,
    payload: {
      batchId: batch.id,
      reason: 'admin take-over',
      currentStep: batch.currentStep,
      previousHolder: batch.currentHolder,
      newHolder: input.newHolderId,
    },
    mentionedUserIds: [input.newHolderId],
  })
  revalidatePath('/', 'layout')
  return { ok: true as const, changed: true }
}

export async function completeOnboardingAction(input: {
  clientId: string
  /** Optional initial-batch label, defaults to current YYYY-MM. */
  firstBatchLabel?: string
}) {
  const ctx = await requireCan('relay.completeOnboarding')
  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      organizationId: true,
      assignedAmId: true,
      onboardingCompletedAt: true,
    },
  })
  if (!client) throw new Error('Client not found')
  if (client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Forbidden: client not in active org')
  }

  return db.$transaction(async (tx) => {
    if (!client.onboardingCompletedAt) {
      await tx.client.update({
        where: { id: client.id },
        data: { onboardingCompletedAt: new Date() },
      })
    }

    const label = input.firstBatchLabel ?? defaultMonthLabel()
    const existing = await tx.batch.findFirst({
      where: { clientId: client.id, label },
      select: { id: true },
    })
    if (existing) {
      await recordActivity(
        {
          clientId: client.id,
          actorId: ctx.userDbId,
          kind: ActivityKind.batch_step_advanced,
          payload: {
            reason: 'onboarding completed (batch already existed)',
            batchId: existing.id,
          },
        },
        tx,
      )
      revalidatePath('/', 'layout')
      return { batchId: existing.id, created: false }
    }

    const holderId = client.assignedAmId ?? ctx.userDbId
    const batch = await tx.batch.create({
      data: {
        clientId: client.id,
        label,
        currentStep: RelayStep.copy,
        currentSubState: 'generating',
        currentHolder: holderId,
        currentRole: RelayRole.am,
      },
      select: { id: true },
    })
    await reseedChecklistForStep(tx, batch.id, RelayStep.copy)

    await recordActivity(
      {
        clientId: client.id,
        actorId: ctx.userDbId,
        kind: ActivityKind.batch_created,
        payload: {
          batchId: batch.id,
          label,
          startStep: RelayStep.copy,
        },
        mentionedUserIds: holderId !== ctx.userDbId ? [holderId] : [],
      },
      tx,
    )

    revalidatePath('/', 'layout')
    return { batchId: batch.id, created: true }
  })
}

export async function createBatchAction(input: {
  clientId: string
  label: string
}) {
  const ctx = await requireCan('relay.pass')
  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      organizationId: true,
      assignedAmId: true,
      onboardingCompletedAt: true,
    },
  })
  if (!client) throw new Error('Client not found')
  if (client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Forbidden: client not in active org')
  }
  if (!client.onboardingCompletedAt) {
    throw new Error('Client onboarding not complete; cannot create batch yet')
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.batch.findFirst({
      where: { clientId: client.id, label: input.label },
      select: { id: true },
    })
    if (existing) {
      throw new Error(`Batch ${input.label} already exists for this client`)
    }
    const holderId = client.assignedAmId ?? ctx.userDbId
    const batch = await tx.batch.create({
      data: {
        clientId: client.id,
        label: input.label,
        currentStep: RelayStep.copy,
        currentSubState: 'generating',
        currentHolder: holderId,
        currentRole: RelayRole.am,
      },
      select: { id: true },
    })
    await reseedChecklistForStep(tx, batch.id, RelayStep.copy)
    await recordActivity(
      {
        clientId: client.id,
        actorId: ctx.userDbId,
        kind: ActivityKind.batch_created,
        payload: { batchId: batch.id, label: input.label, startStep: RelayStep.copy },
        mentionedUserIds: holderId !== ctx.userDbId ? [holderId] : [],
      },
      tx,
    )
    revalidatePath('/', 'layout')
    return { batchId: batch.id }
  })
}

function defaultMonthLabel(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

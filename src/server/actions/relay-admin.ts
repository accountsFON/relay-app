'use server'

import { revalidatePath } from 'next/cache'
import { ActivityKind, EventVisibility, RelayRole, RelayStep } from '@prisma/client'
import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import { recordActivity } from '@/server/services/activity'
import { reseedChecklistForStep } from '@/server/lib/relay-state-machine'
import { buildBatchLabel } from '@/lib/batch-target-month'

export async function nudgeStuckBatchAction(input: { batchId: string }) {
  const ctx = await requireCan('relay.takeOver')
  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      clientId: true,
      currentHolder: true,
      currentStep: true,
      label: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!batch) throw new Error('Relay not found')
  // Cross-tenant scope: mirror the check used in completeOnboardingAction
  // and createBatchAction below. Without this an admin in Org A could
  // nudge a stuck batch belonging to Org B and write a misleading
  // activity event into the victim's audit trail.
  if (batch.client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Relay not found')
  }

  await recordActivity({
    clientId: batch.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.batch_step_advanced,
    visibility: EventVisibility.internal,
    payload: {
      batchId: batch.id,
      batchLabel: batch.label,
      step: batch.currentStep,
      fromSubState: 'idle',
      toSubState: 'admin nudge sent',
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
      label: true,
      client: { select: { organizationId: true } },
    },
  })
  if (!batch) throw new Error('Relay not found')
  // Cross-tenant scope: see nudgeStuckBatchAction above.
  if (batch.client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Relay not found')
  }
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
    visibility: EventVisibility.internal,
    payload: {
      batchId: batch.id,
      batchLabel: batch.label,
      step: batch.currentStep,
      fromSubState: 'previous holder',
      toSubState: 'admin take over',
    },
    mentionedUserIds: [input.newHolderId],
  })
  revalidatePath('/', 'layout')
  return { ok: true as const, changed: true }
}

export async function completeOnboardingAction(input: {
  clientId: string
  /** Optional initial-batch label, defaults to "{Client Name} {Month Year}". */
  firstBatchLabel?: string
}) {
  const ctx = await requireCan('relay.completeOnboarding')
  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      assignedAmId: true,
      onboardingCompletedAt: true,
      clientReviewEnabled: true,
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

    const label = input.firstBatchLabel ?? defaultMonthLabel(client.name)
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
          visibility: EventVisibility.internal,
          payload: {
            batchId: existing.id,
            batchLabel: label,
            step: RelayStep.copy,
            fromSubState: 'onboarding',
            toSubState: 'onboarding complete (batch existed)',
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
        // Snapshot the Client toggle so toggling the flag later does not
        // retroactively reroute batches already in flight.
        clientReviewEnabled: client.clientReviewEnabled,
      },
      select: { id: true },
    })
    await reseedChecklistForStep(tx, batch.id, RelayStep.copy)

    await recordActivity(
      {
        clientId: client.id,
        actorId: ctx.userDbId,
        kind: ActivityKind.batch_created,
        visibility: EventVisibility.internal,
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
      clientReviewEnabled: true,
    },
  })
  if (!client) throw new Error('Client not found')
  if (client.organizationId !== ctx.organizationDbId && !ctx.platformOwner) {
    throw new Error('Forbidden: client not in active org')
  }
  if (!client.onboardingCompletedAt) {
    throw new Error('Client onboarding not complete; cannot create relay yet')
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.batch.findFirst({
      where: { clientId: client.id, label: input.label },
      select: { id: true },
    })
    if (existing) {
      throw new Error(`Relay ${input.label} already exists for this client`)
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
        // Snapshot the Client toggle. Toggling the flag later does not
        // retroactively reroute batches already in flight.
        clientReviewEnabled: client.clientReviewEnabled,
      },
      select: { id: true },
    })
    await reseedChecklistForStep(tx, batch.id, RelayStep.copy)
    await recordActivity(
      {
        clientId: client.id,
        actorId: ctx.userDbId,
        kind: ActivityKind.batch_created,
        visibility: EventVisibility.internal,
        payload: { batchId: batch.id, label: input.label, startStep: RelayStep.copy },
        mentionedUserIds: holderId !== ctx.userDbId ? [holderId] : [],
      },
      tx,
    )
    revalidatePath('/', 'layout')
    return { batchId: batch.id }
  })
}

function defaultMonthLabel(clientName: string): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return buildBatchLabel(clientName, `${y}-${m}`)
}

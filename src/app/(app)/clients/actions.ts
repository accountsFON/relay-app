'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  createClient,
  updateClient,
  deactivateClient,
  findClientForUser,
} from '@/server/repositories/clients'
import {
  clientInputSchema,
  clientUpdateSchema,
  type ClientInput,
  type ClientUpdate,
} from '@/lib/schemas/client'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { db } from '@/db/client'
import { diffFieldChanges } from '@/lib/field-changes'

export async function createClientAction(input: ClientInput) {
  const ctx = await requireClientEditor()
  const parsed = clientInputSchema.parse(input)

  const created = await createClient({
    organizationId: ctx.organizationDbId,
    ...parsed,
  })

  await recordActivity({
    clientId: created.id,
    actorId: ctx.userDbId,
    kind: ActivityKind.client_created,
    payload: { clientName: created.name },
  })

  revalidatePath('/clients')
  redirect(`/clients/${created.id}`)
}

const USER_ID_FIELDS = new Set(['assignedAmId', 'assignedDesignerId'])

export async function updateClientAction(id: string, input: ClientUpdate) {
  const ctx = await requireClientEditor()
  const parsed = clientUpdateSchema.parse(input)

  // Within-org scope guard: findClientForUser returns null if the actor
  // has no scope into this client (AM not assigned, designer not
  // assigned, client not linked). Treat null as "not found" rather
  // than 403 to avoid existence leak. Previously the write fired
  // regardless of this lookup; an AM could update any client in their
  // org by passing its id, even ones they weren't assigned to.
  const before = await findClientForUser(ctx, id)
  if (!before) return

  await updateClient(id, ctx.organizationDbId, parsed)

  const beforeRec = before as Record<string, unknown>
  const afterRec = parsed as Record<string, unknown>
  const userIds = [...USER_ID_FIELDS]
    .flatMap((f) => [beforeRec[f], afterRec[f]])
    .filter((v): v is string => typeof v === 'string')
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const changes = diffFieldChanges(beforeRec, afterRec, (field, value) =>
    // Resolve a non-empty user id to a name; let empty/cleared (unassign) fall
    // through to formatFieldValue so it renders "(empty)" on both sides.
    USER_ID_FIELDS.has(field) && typeof value === 'string' && value !== ''
      ? userName.get(value) ?? value
      : undefined,
  )
  if (changes.length > 0) {
    await recordActivity({
      clientId: id,
      actorId: ctx.userDbId,
      kind: ActivityKind.client_profile_edited,
      payload: { changes },
    })
  }

  revalidatePath(`/clients/${id}`)
  revalidatePath('/clients')
}

export async function deactivateClientAction(id: string) {
  const ctx = await requireClientEditor()

  // Same within-org scope guard as updateClientAction. Previously this
  // action had no scope check at all beyond requireClientEditor (role),
  // so an AM could deactivate any client in their org.
  const client = await findClientForUser(ctx, id)
  if (!client) return

  await deactivateClient(id, ctx.organizationDbId)

  await recordActivity({
    clientId: id,
    actorId: ctx.userDbId,
    kind: ActivityKind.client_archived,
    payload: {},
  })

  revalidatePath('/clients')
}

export type OnboardingItem = 'account' | 'designFolder' | 'assets'

const ONBOARDING_FIELD: Record<
  OnboardingItem,
  'onboardingAccountFilledOut' | 'onboardingDesignFolderReady' | 'onboardingAssetsReceived'
> = {
  account: 'onboardingAccountFilledOut',
  designFolder: 'onboardingDesignFolderReady',
  assets: 'onboardingAssetsReceived',
}

/** Tick/untick one onboarding checklist item. Inert once onboarding is complete. */
export async function setClientOnboardingItemAction(
  clientId: string,
  item: OnboardingItem,
  checked: boolean,
) {
  const ctx = await requireClientEditor()
  const before = await findClientForUser(ctx, clientId)
  if (!before) return
  if (before.onboardingCompletedAt) return // one-time; no edits after completion
  await db.client.update({
    where: { id: clientId },
    data: { [ONBOARDING_FIELD[item]]: checked },
  })
  revalidatePath(`/clients/${clientId}`)
}

/** Mark client onboarding complete. Requires all three items checked (server-enforced). */
export async function completeClientOnboardingAction(clientId: string) {
  const ctx = await requireClientEditor()
  const before = await findClientForUser(ctx, clientId)
  if (!before) return
  if (before.onboardingCompletedAt) return // already complete; idempotent no-op
  const allChecked =
    before.onboardingAccountFilledOut &&
    before.onboardingDesignFolderReady &&
    before.onboardingAssetsReceived
  if (!allChecked) {
    throw new Error('Complete all onboarding items before finishing onboarding')
  }
  await db.client.update({
    where: { id: clientId },
    data: { onboardingCompletedAt: new Date() },
  })
  await recordActivity({
    clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.client_onboarding_completed,
    payload: {},
  })
  revalidatePath(`/clients/${clientId}`)
}

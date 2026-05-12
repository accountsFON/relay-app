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

export async function updateClientAction(id: string, input: ClientUpdate) {
  const ctx = await requireClientEditor()
  const parsed = clientUpdateSchema.parse(input)

  // Snapshot the prior values so we can emit a single client_profile_edited
  // event with `fieldsChanged`.
  const before = await findClientForUser(ctx, id)
  await updateClient(id, ctx.organizationDbId, parsed)

  if (before) {
    const fieldsChanged = diffFields(before as Record<string, unknown>, parsed)
    if (fieldsChanged.length > 0) {
      await recordActivity({
        clientId: id,
        actorId: ctx.userDbId,
        kind: ActivityKind.client_profile_edited,
        payload: { fieldsChanged },
      })
    }
  }

  revalidatePath(`/clients/${id}`)
  revalidatePath('/clients')
}

export async function deactivateClientAction(id: string) {
  const ctx = await requireClientEditor()
  await deactivateClient(id, ctx.organizationDbId)

  await recordActivity({
    clientId: id,
    actorId: ctx.userDbId,
    kind: ActivityKind.client_archived,
    payload: {},
  })

  revalidatePath('/clients')
}

function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = []
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue
    const prior = before[key]
    if (Array.isArray(value) && Array.isArray(prior)) {
      if (
        value.length !== prior.length ||
        value.some((v, i) => v !== prior[i])
      ) {
        changed.push(key)
      }
      continue
    }
    if (prior !== value) changed.push(key)
  }
  return changed
}

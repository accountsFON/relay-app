'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import {
  createClient,
  updateClient,
  archiveClient,
} from '@/server/repositories/clients'
import {
  clientInputSchema,
  clientUpdateSchema,
  type ClientInput,
  type ClientUpdate,
} from '@/lib/schemas/client'

export async function createClientAction(input: ClientInput) {
  const ctx = await requireClientEditor()
  const parsed = clientInputSchema.parse(input)

  const created = await createClient({
    organizationId: ctx.organizationDbId,
    ...parsed,
  })

  revalidatePath('/clients')
  redirect(`/clients/${created.id}`)
}

export async function updateClientAction(id: string, input: ClientUpdate) {
  const ctx = await requireClientEditor()
  const parsed = clientUpdateSchema.parse(input)

  await updateClient(id, ctx.organizationDbId, parsed)

  revalidatePath(`/clients/${id}`)
  revalidatePath('/clients')
}

export async function archiveClientAction(id: string) {
  const ctx = await requireClientEditor()
  await archiveClient(id, ctx.organizationDbId)
  revalidatePath('/clients')
}

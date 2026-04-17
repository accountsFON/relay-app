'use client'

import { ClientForm } from '@/components/clients/client-form'
import { createClientAction } from '@/app/(app)/clients/actions'
import type { ClientInput } from '@/lib/schemas/client'

export function CreateClientForm() {
  async function handleSubmit(input: ClientInput) {
    await createClientAction(input)
  }

  return <ClientForm mode="create" onSubmit={handleSubmit} />
}

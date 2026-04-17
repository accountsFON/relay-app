'use client'

import { useRouter } from 'next/navigation'
import { ClientForm } from '@/components/clients/client-form'
import { updateClientAction } from '@/app/(app)/clients/actions'
import type { ClientInput } from '@/lib/schemas/client'

type Props = {
  clientId: string
  defaultValues: Partial<ClientInput>
}

export function EditClientForm({ clientId, defaultValues }: Props) {
  const router = useRouter()

  async function handleSubmit(input: ClientInput) {
    await updateClientAction(clientId, input)
    router.push(`/clients/${clientId}`)
  }

  return (
    <ClientForm
      mode="edit"
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
    />
  )
}

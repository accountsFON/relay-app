import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { EditClientForm } from './edit-form'

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireClientEditor()
  const { id } = await params

  const client = await findClientById(id, ctx.organizationDbId)
  if (!client) notFound()

  const defaultValues = {
    name: client.name,
    businessSummary: client.businessSummary ?? undefined,
    brandVoice: client.brandVoice ?? undefined,
    industry: client.industry ?? undefined,
    location: client.location ?? undefined,
    phone: client.phone ?? undefined,
    mainCta: client.mainCta ?? undefined,
    focus1: client.focus1 ?? undefined,
    focus2: client.focus2 ?? undefined,
    focus3: client.focus3 ?? undefined,
    dos: client.dos ?? undefined,
    donts: client.donts ?? undefined,
    postingDays: client.postingDays,
    postLength: client.postLength ?? undefined,
    urls: client.urls,
    targetAudience: client.targetAudience ?? undefined,
    holidayHandling: client.holidayHandling as 'Major-US' | 'Off',
    excludedDates: client.excludedDates,
    assetsFolderUrl: client.assetsFolderUrl ?? undefined,
    status: client.status,
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 sm:mb-8">
        <Link
          href={`/clients/${client.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to {client.name}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">Edit client</h1>
      </div>

      <EditClientForm clientId={client.id} defaultValues={defaultValues} />
    </div>
  )
}

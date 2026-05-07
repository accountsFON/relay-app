import { notFound } from 'next/navigation'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientById } from '@/server/repositories/clients'
import { EditClientForm } from './edit-form'
import { PageHeader } from '@/components/page-header'

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
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <PageHeader
        title={`Edit ${client.name}`}
        backHref={`/clients/${client.id}`}
        backLabel={`Back to ${client.name}`}
      />
      <div className="mt-10">
        <EditClientForm clientId={client.id} defaultValues={defaultValues} />
      </div>
    </div>
  )
}

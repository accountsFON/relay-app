import { requireCan } from '@/server/middleware/permissions'
import { ImportForm } from './import-form'
import { HeroBand } from '@/components/hero-band'

export default async function ImportClientsPage() {
  await requireCan('client.create')

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <HeroBand
        title="Import clients"
        subtitle="Upload a CSV to add one client or many at once."
        breadcrumb={[
          { label: 'Clients', href: '/clients' },
          { label: 'Import clients' },
        ]}
      />
      <div className="mt-10">
        <ImportForm />
      </div>
    </div>
  )
}

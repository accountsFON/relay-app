import { requireCan } from '@/server/middleware/permissions'
import { ImportForm } from './import-form'
import { PageHeader } from '@/components/page-header'

export default async function ImportClientsPage() {
  await requireCan('client.create')

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-4xl">
      <PageHeader
        title="Import clients"
        description="Upload a CSV to add one client or many at once."
        backHref="/clients"
        backLabel="Back to clients"
      />
      <div className="mt-10">
        <ImportForm />
      </div>
    </div>
  )
}

import { requireClientEditor } from '@/server/middleware/permissions'
import { CreateClientForm } from './create-form'
import { PageHeader } from '@/components/page-header'

export default async function NewClientPage() {
  await requireClientEditor()

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <PageHeader
        title="New client"
        description="Add a new brand to the system. You can always edit these fields later."
        backHref="/clients"
        backLabel="Back to clients"
      />
      <div className="mt-10">
        <CreateClientForm />
      </div>
    </div>
  )
}

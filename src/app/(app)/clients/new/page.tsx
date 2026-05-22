import { requireClientEditor } from '@/server/middleware/permissions'
import { CreateClientForm } from './create-form'
import { HeroBand } from '@/components/hero-band'

export default async function NewClientPage() {
  await requireClientEditor()

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <HeroBand
        title="New client"
        subtitle="Add a new brand to the system. You can always edit these fields later."
        breadcrumb={[
          { label: 'Clients', href: '/clients' },
          { label: 'New client' },
        ]}
      />
      <div className="mt-10">
        <CreateClientForm />
      </div>
    </div>
  )
}

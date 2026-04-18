import Link from 'next/link'
import { requireClientEditor } from '@/server/middleware/permissions'
import { CreateClientForm } from './create-form'

export default async function NewClientPage() {
  await requireClientEditor()

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 sm:mb-8">
        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to clients
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">New client</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new brand to the system. You can always edit these fields later.
        </p>
      </div>

      <CreateClientForm />
    </div>
  )
}

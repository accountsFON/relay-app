import Link from 'next/link'
import { requireClientEditor } from '@/server/middleware/permissions'
import { CreateClientForm } from './create-form'

export default async function NewClientPage() {
  await requireClientEditor()

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/clients" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to clients
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">New client</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add a new brand to the system. You can always edit these fields later.
        </p>
      </div>

      <CreateClientForm />
    </div>
  )
}

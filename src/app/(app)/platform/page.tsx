import { db } from '@/db/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateAgencyButton } from './create-agency-modal'
import { StepIntoAgencyButton } from './step-into-button'

export default async function PlatformIndexPage() {
  const orgs = await db.organization.findMany({
    include: {
      _count: {
        select: { users: true, clients: true, memberships: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-end justify-between sm:mb-8">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Platform</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {orgs.length} {orgs.length === 1 ? 'agency' : 'agencies'} on this platform.
          </p>
        </div>
        <CreateAgencyButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => (
          <Card key={org.id} className="p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{org.name}</h2>
              <Badge variant="secondary">{org.plan}</Badge>
            </div>
            <div className="mb-4 space-y-1 text-sm text-muted-foreground">
              <div>{org._count.memberships} {org._count.memberships === 1 ? 'member' : 'members'}</div>
              <div>{org._count.clients} {org._count.clients === 1 ? 'client' : 'clients'}</div>
              <div className="text-xs">Created {org.createdAt.toLocaleDateString()}</div>
            </div>
            <StepIntoAgencyButton clerkOrgId={org.clerkOrgId} />
          </Card>
        ))}
      </div>
    </div>
  )
}

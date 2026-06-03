import { requireOrgContext } from '@/server/middleware/auth'
import {
  countUserOwnedRecords,
  findUserByClerkId,
} from '@/server/repositories/users'
import { getSelfDeactivationBlock } from '@/server/services/users'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { CloseAccountPanel } from '@/components/settings/close-account-panel'

type Inventory = Awaited<ReturnType<typeof countUserOwnedRecords>>

/** Human readable "what you are holding" sentence for the close warning. */
function inventoryWarning(inv: Inventory): string {
  const parts: string[] = []
  if (inv.heldBatches > 0) {
    parts.push(
      `${inv.heldBatches} ${inv.heldBatches === 1 ? 'batch' : 'batches'}`,
    )
  }
  if (inv.assignedAmClients > 0) {
    parts.push(
      `AM on ${inv.assignedAmClients} ${inv.assignedAmClients === 1 ? 'client' : 'clients'}`,
    )
  }
  if (inv.assignedDesignerClients > 0) {
    parts.push(`designer on ${inv.assignedDesignerClients}`)
  }
  if (parts.length === 0) return ''
  return `You are currently holding ${parts.join(', ')}. These pause until an admin reassigns them.`
}

export default async function AccountSettingsPage() {
  const ctx = await requireOrgContext()

  const [dbUser, inventory, block] = await Promise.all([
    findUserByClerkId(ctx.userId),
    countUserOwnedRecords(ctx.userDbId, ctx.organizationDbId),
    getSelfDeactivationBlock({
      userId: ctx.userDbId,
      isPlatformOwner: ctx.platformOwner,
    }),
  ])

  const userEmail = dbUser?.email ?? ''

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <HeroBand
        title="Account"
        subtitle="Your personal account settings."
      />
      <div className="mt-8">
        <PageSection title="Danger zone">
          <CloseAccountPanel
            userEmail={userEmail}
            blocked={block.blocked}
            blockReason={block.reason}
            inventoryText={inventoryWarning(inventory)}
          />
        </PageSection>
      </div>
    </div>
  )
}

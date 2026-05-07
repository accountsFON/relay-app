import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { findUserInOrg } from '@/server/repositories/users'
import { listClientsByOrgWithAssignments } from '@/server/repositories/clients'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AssignmentToggle } from './assignment-toggle'
import { PermissionEditor } from './permission-editor'
import { RoleChanger } from './role-changer'
import {
  can,
  PERMISSION_KEYS,
  type PermissionKey,
} from '@/server/auth/permissions'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'AM',
  designer: 'Designer',
  client: 'Client',
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireAdminPortal()
  const { id } = await params

  const user = await findUserInOrg(id, ctx.organizationDbId)
  if (!user) notFound()

  const clients = await listClientsByOrgWithAssignments(ctx.organizationDbId)

  const editableSlot: 'am' | 'designer' | null =
    user.role === 'account_manager'
      ? 'am'
      : user.role === 'designer'
        ? 'designer'
        : null

  const assignedCount =
    user.role === 'designer'
      ? user.designedClients.length
      : user.assignedClients.length

  // Compute the merged (system + org role default) value for each permission
  // — this is the "default" the editor displays alongside the override radios.
  const defaultsByKey: Partial<Record<PermissionKey, boolean>> = {}
  for (const key of PERMISSION_KEYS) {
    defaultsByKey[key] = can(
      {
        role: user.role,
        permissionOverrides: null,
        roleDefaults: ctx.roleDefaults,
      },
      key,
    )
  }
  const initialOverrides =
    (user.permissionOverrides as Partial<Record<PermissionKey, boolean>>) ?? {}

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to team
        </Link>
      </div>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email} ·{' '}
          <Badge variant="secondary" className="ml-1">
            {ROLE_LABELS[user.role]}
          </Badge>
          {(user.role === 'account_manager' || user.role === 'designer') && (
            <span className="ml-2">
              {assignedCount} {assignedCount === 1 ? 'client' : 'clients'}{' '}
              assigned
            </span>
          )}
        </p>
      </div>

      <Card className="mb-6 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Role
        </h2>
        <RoleChanger
          userId={user.id}
          currentRole={user.role}
          isSelf={user.id === ctx.userDbId}
        />
      </Card>

      {editableSlot === null ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            {user.role === 'admin'
              ? 'Admins see and operate on every client. There are no per-client assignments to manage.'
              : 'This role does not use per-client assignments.'}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="border-b border-border p-4">
            <h2 className="font-semibold text-foreground">
              Client assignments
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Toggle clients to assign or reassign. The{' '}
              <strong>
                {editableSlot === 'am' ? 'AM' : 'Designer'}
              </strong>{' '}
              column is editable for this user.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">AM</th>
                  <th className="px-4 py-2">Designer</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const slotAssignee =
                    editableSlot === 'am' ? c.assignedAm : c.assignedDesigner
                  return (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {c.name}
                        </div>
                        {c.industry && (
                          <div className="text-xs text-muted-foreground">
                            {c.industry}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.assignedAm?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.assignedDesigner?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AssignmentToggle
                          userId={user.id}
                          clientId={c.id}
                          slot={editableSlot}
                          currentAssigneeId={slotAssignee?.id ?? null}
                          currentAssigneeName={slotAssignee?.name ?? null}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {clients.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No clients yet. Create one to start assigning.
            </div>
          )}
        </Card>
      )}

      <Card className="mt-8">
        <PermissionEditor
          userId={user.id}
          defaultsByKey={defaultsByKey}
          initialOverrides={initialOverrides}
        />
      </Card>
    </div>
  )
}

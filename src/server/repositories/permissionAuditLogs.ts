import { db } from '@/db/client'
import type { UserRole } from '@/lib/types'

export type PermissionAuditEntry = {
  organizationId: string
  actorUserId: string
  targetUserId: string | null
  targetRole: UserRole | null
  permissionKey: string
  fromValue: boolean | null
  toValue: boolean | null
}

export async function recordPermissionAudits(entries: PermissionAuditEntry[]) {
  if (entries.length === 0) return
  await db.permissionAuditLog.createMany({
    data: entries,
  })
}

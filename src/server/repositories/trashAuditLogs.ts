import type { Prisma } from '@prisma/client'
import type { DbClient, DbTx } from '@/db/client'

export type TrashAuditAction = 'archive' | 'restore' | 'purge'
export type TrashEntityType = 'client' | 'batch' | 'contentRun' | 'post'

export interface TrashAuditInput {
  actorUserId: string
  organizationId: string
  action: TrashAuditAction
  entityType: TrashEntityType
  entityId: string
  parentContext: Record<string, unknown>
  cascadeCount: number
}

export async function writeTrashAudit(
  db: DbClient | DbTx,
  input: TrashAuditInput,
): Promise<void> {
  await db.trashAuditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      parentContext: input.parentContext as Prisma.InputJsonValue,
      cascadeCount: input.cascadeCount,
    },
  })
}

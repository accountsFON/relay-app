import { db } from '@/db/client'

type ImpersonationLogInput = {
  realActorId: string
  targetUserId: string
  organizationId: string
}

export async function recordImpersonationStart(input: ImpersonationLogInput) {
  return db.impersonationLog.create({ data: { ...input, action: 'start' } })
}

export async function recordImpersonationStop(input: ImpersonationLogInput) {
  return db.impersonationLog.create({ data: { ...input, action: 'stop' } })
}

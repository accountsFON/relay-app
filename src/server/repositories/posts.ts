import { db } from '@/db/client'
import type { ApprovalStatus } from '@/lib/types'

export async function findPostsByRun(contentRunId: string) {
  return db.post.findMany({
    where: { contentRunId },
    orderBy: { postDate: 'asc' },
  })
}

export async function findPostById(id: string) {
  return db.post.findUnique({ where: { id } })
}

export async function updatePost(
  id: string,
  data: {
    caption?: string
    hashtags?: string[]
    graphicHook?: string | null
    designerNotes?: string | null
    approvalStatus?: ApprovalStatus
  }
) {
  return db.post.update({ where: { id }, data })
}

export async function updatePostStatus(id: string, status: ApprovalStatus) {
  return db.post.update({
    where: { id },
    data: { approvalStatus: status },
  })
}

export async function bulkUpdateStatus(
  contentRunId: string,
  status: ApprovalStatus
) {
  return db.post.updateMany({
    where: { contentRunId },
    data: { approvalStatus: status },
  })
}

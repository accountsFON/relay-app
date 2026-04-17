'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { updatePost, updatePostStatus } from '@/server/repositories/posts'
import type { ApprovalStatus } from '@/lib/types'

export async function updatePostAction(
  postId: string,
  data: {
    caption?: string
    hashtags?: string[]
    graphicHook?: string | null
    designerNotes?: string | null
  }
) {
  await requireClientEditor()
  await updatePost(postId, data)
  revalidatePath('/', 'layout')
}

export async function updatePostStatusAction(
  postId: string,
  status: string
) {
  await requireClientEditor()
  await updatePostStatus(postId, status as ApprovalStatus)
  revalidatePath('/', 'layout')
}

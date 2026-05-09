'use server'

import { revalidatePath } from 'next/cache'
import { requireClientEditor } from '@/server/middleware/permissions'
import { updatePost } from '@/server/repositories/posts'

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

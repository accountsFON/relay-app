import { db } from '@/db/client'

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
  }
) {
  return db.post.update({ where: { id }, data })
}

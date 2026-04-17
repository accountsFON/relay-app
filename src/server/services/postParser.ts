import { db } from '@/db/client'
import type { ParsedPost } from '@/server/services/captionGenerator'

export async function createPostsFromCaptions(
  posts: ParsedPost[],
  contentRunId: string,
  clientId: string
): Promise<number> {
  const data = posts.map((p) => ({
    contentRunId,
    clientId,
    postDate: parsePostDate(p.date),
    caption: p.caption,
    hashtags: p.hashtags,
    graphicHook: p.graphicHook || null,
    designerNotes: p.designerNotes || null,
    approvalStatus: 'draft' as const,
    mediaUrls: [],
  }))

  const result = await db.post.createMany({ data })
  return result.count
}

function parsePostDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T12:00:00Z')
  }

  if (/^\d{2}\/\d{2}$/.test(dateStr)) {
    const [month, day] = dateStr.split('/')
    const year = new Date().getFullYear()
    return new Date(`${year}-${month}-${day}T12:00:00Z`)
  }

  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) return parsed

  return new Date()
}

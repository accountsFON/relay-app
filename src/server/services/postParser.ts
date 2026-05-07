import { db } from '@/db/client'
import type { ParsedPost } from '@/server/services/captionGenerator'

export type CtaCandidate = {
  label?: string
  body: string
}

export function parseCtaCandidates(mainCta: string | null | undefined): CtaCandidate[] {
  if (!mainCta?.trim()) return []

  const sections = mainCta
    .split(/\n[ \t]*_{5,}[ \t]*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return sections.map((section) => {
    const lines = section.split('\n')
    const firstLine = lines[0].trim()
    const isLabel =
      firstLine.length > 0 &&
      firstLine.length < 80 &&
      firstLine === firstLine.toUpperCase() &&
      /[A-Z]/.test(firstLine) &&
      !/[📞➡️🌐@]|https?:|www\./i.test(firstLine) &&
      lines.length > 1

    if (isLabel) {
      return {
        label: firstLine,
        body: lines.slice(1).join('\n').trim(),
      }
    }
    return { body: section }
  })
}

export async function createPostsFromCaptions(
  posts: ParsedPost[],
  contentRunId: string,
  clientId: string,
  ctaCandidates: CtaCandidate[]
): Promise<number> {
  const data = posts.map((p) => {
    const idx = pickCtaIndex(p.ctaIndex, ctaCandidates.length)
    const chosen = idx >= 0 ? ctaCandidates[idx] : undefined
    const ctaSuffix = chosen?.body ? `\n\n${chosen.body}` : ''
    return {
      contentRunId,
      clientId,
      postDate: parsePostDate(p.date),
      caption: `${p.caption.trimEnd()}${ctaSuffix}`,
      hashtags: p.hashtags,
      graphicHook: p.graphicHook || null,
      designerNotes: p.designerNotes || null,
      approvalStatus: 'draft' as const,
      mediaUrls: [],
    }
  })

  const result = await db.post.createMany({ data })
  return result.count
}

function pickCtaIndex(claimed: number | undefined, count: number): number {
  if (count === 0) return -1
  if (count === 1) return 0
  if (
    typeof claimed === 'number' &&
    Number.isInteger(claimed) &&
    claimed >= 0 &&
    claimed < count
  ) {
    return claimed
  }
  return 0
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

import { db } from '@/db/client'
import type { ParsedPost } from '@/server/services/captionGenerator'

export type CtaCandidate = {
  label?: string
  body: string
}

const DELIMITER_LINE = /^[ \t]*([_\-=*~])\1{4,}[ \t]*$/

export function parseCtaCandidates(mainCta: string | null | undefined): CtaCandidate[] {
  if (!mainCta?.trim()) return []

  const lines = mainCta.split('\n')
  const sections: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (DELIMITER_LINE.test(line)) {
      const joined = current.join('\n').trim()
      if (joined.length > 0) sections.push(joined)
      current = []
    } else {
      current.push(line)
    }
  }
  const finalJoined = current.join('\n').trim()
  if (finalJoined.length > 0) sections.push(finalJoined)

  return sections.map((section) => {
    const sectionLines = section.split('\n')
    const firstLine = sectionLines[0].trim()
    const isLabel =
      firstLine.length > 0 &&
      firstLine.length < 80 &&
      firstLine === firstLine.toUpperCase() &&
      /[A-Z]/.test(firstLine) &&
      !/[📞➡️🌐@]|https?:|www\./i.test(firstLine) &&
      sectionLines.length > 1

    if (isLabel) {
      return {
        label: firstLine,
        body: sectionLines.slice(1).join('\n').trim(),
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

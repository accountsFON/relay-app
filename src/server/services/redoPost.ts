/**
 * Per-post AI redo. Regenerates the caption, hashtags, graphic hook, and
 * designer notes for a single Post using the same context the original
 * monthly run had (brief, supporting facts, client brand voice, CTA
 * candidates), but only for the one Post's date. Captures the prior state
 * as a PostVersion snapshot so the AM can revert if the redo is worse.
 *
 * Distinct from `generateContent`, which produces a whole batch.
 *
 * Spec: Phase 2 item 13 (per-post regenerate button).
 */
import { db } from '@/db/client'
import { generateCaptions } from '@/server/services/captionGenerator'
import { parseCtaCandidates } from '@/server/services/postParser'
import { snapshotPostVersion } from '@/server/services/postVersions'
import type { PostingDate } from '@/server/services/dateCalculator'

export type RedoPostInput = {
  postId: string
  actorUserId: string
}

export type RedoPostResult = {
  postVersionId: string
  newCaption: string
  costUsd: number
}

export class RedoPostNotFoundError extends Error {
  constructor(postId: string) {
    super(`Post ${postId} not found`)
    this.name = 'RedoPostNotFoundError'
  }
}

export class RedoPostMissingContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedoPostMissingContextError'
  }
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function postingDateFromPost(postDate: Date): PostingDate {
  // postDate is stored as UTC midnight + 12h offset; pull UTC components
  // so we don't double-shift in a local timezone.
  const yyyy = postDate.getUTCFullYear()
  const mm = String(postDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(postDate.getUTCDate()).padStart(2, '0')
  return {
    date: `${yyyy}-${mm}-${dd}`,
    day: DAY_NAMES[postDate.getUTCDay()],
  }
}

export async function redoPostCaption(
  input: RedoPostInput,
): Promise<RedoPostResult> {
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      caption: true,
      hashtags: true,
      graphicHook: true,
      designerNotes: true,
      postDate: true,
      clientId: true,
      contentRunId: true,
    },
  })
  if (!post) throw new RedoPostNotFoundError(input.postId)

  const [run, client] = await Promise.all([
    db.contentRun.findUnique({
      where: { id: post.contentRunId },
      select: { id: true, brief: true, supportingFacts: true, openaiCostUsd: true },
    }),
    db.client.findUnique({
      where: { id: post.clientId },
      select: {
        postLength: true,
        dos: true,
        donts: true,
        brandVoice: true,
        mainCta: true,
      },
    }),
  ])
  if (!run) {
    throw new RedoPostMissingContextError(
      `ContentRun ${post.contentRunId} not found`,
    )
  }
  if (!client) {
    throw new RedoPostMissingContextError(`Client ${post.clientId} not found`)
  }
  if (!run.brief || !run.supportingFacts) {
    throw new RedoPostMissingContextError(
      'Original ContentRun has no brief / supporting facts; cannot redo without context',
    )
  }

  const ctaCandidates = parseCtaCandidates(client.mainCta)
  const postingDates: PostingDate[] = [postingDateFromPost(post.postDate)]

  const result = await generateCaptions(
    run.brief,
    run.supportingFacts,
    postingDates,
    client,
    ctaCandidates,
  )

  const fresh = result.posts[0]
  if (!fresh) {
    throw new RedoPostMissingContextError(
      'Caption generator returned no posts for the redo',
    )
  }

  // Apply CTA exactly like createPostsFromCaptions does so the suffix
  // shape matches the original ingest path.
  const ctaIdx = pickCtaIndex(fresh.ctaIndex, ctaCandidates.length)
  const chosen = ctaIdx >= 0 ? ctaCandidates[ctaIdx] : undefined
  const ctaSuffix = chosen?.body ? `\n\n${chosen.body}` : ''
  const newCaption = `${fresh.caption.trimEnd()}${ctaSuffix}`

  // Snapshot the PRIOR state (idempotent + tolerant in the repo).
  const version = await snapshotPostVersion({
    postId: post.id,
    authorId: input.actorUserId,
    body: {
      caption: post.caption,
      hashtags: post.hashtags,
      graphicHook: post.graphicHook,
      designerNotes: post.designerNotes,
    },
  })

  await db.post.update({
    where: { id: post.id },
    data: {
      caption: newCaption,
      hashtags: fresh.hashtags,
      graphicHook: fresh.graphicHook || null,
      designerNotes: fresh.designerNotes || null,
      preQaCaption: fresh.originalCaption ?? null,
    },
  })

  // Fold the redo cost into the originating ContentRun so the per-client
  // total still reflects every model call this run generated. Round to 4
  // decimal places to match the costTracker pattern and avoid
  // floating-point creep across multiple redos.
  const newTotal =
    Math.round(
      (Number(run.openaiCostUsd ?? 0) + result.cost.usd) * 10000,
    ) / 10000
  await db.contentRun.update({
    where: { id: run.id },
    data: { openaiCostUsd: newTotal },
  })

  return {
    postVersionId: version?.id ?? '',
    newCaption,
    costUsd: result.cost.usd,
  }
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

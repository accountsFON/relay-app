/**
 * Fix with AI service: propose + accept flow for AI-assisted caption rewrites.
 *
 * Spec: projects/relay-app/2026-05-16-post-preview-feedback-system-design.md
 *       § Fix with AI (full section)
 *
 * Public surface:
 *   - proposeFix({ postId, threadId }), load post + thread + client brand
 *     context, call the model with the prompt from fixWithAiPrompt.ts,
 *     return the rewrite + diff + token usage. No DB writes.
 *   - acceptFix({ postId, threadId, proposedCaption, acceptedBy }), create
 *     a new PostVersion, update Post.caption, auto-resolve the originating
 *     thread, emit a post_caption_ai_fixed ActivityEvent.
 *
 * Model + cost tracking mirror src/server/services/captionGenerator.ts.
 * Cost folds into ContentRun.openaiCostUsd per design doc (per-fix line
 * items deferred to v2).
 */

import Anthropic from '@anthropic-ai/sdk'

import { db } from '@/db/client'
import { ActivityKind } from '@prisma/client'

import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost } from '@/server/services/costTracker'
import { recordActivity } from '@/server/services/activity'
import { resolveThread } from '@/server/repositories/threads'

import { buildFixWithAiPrompt } from '@/server/prompts/fixWithAiPrompt'
import { diffText, type DiffSegment } from '@/lib/text-diff'

export type { DiffSegment } from '@/lib/text-diff'

export type ProposeFixInput = {
  postId: string
  threadId: string
}

export type ProposeFixResult = {
  proposedCaption: string
  diff: DiffSegment[]
  tokenUsage: { in: number; out: number; costUsd: number }
}

export type AcceptFixInput = {
  postId: string
  threadId: string
  proposedCaption: string
  acceptedBy: string // DB User.id (Clerk-authenticated AM)
}

export type AcceptFixResult = {
  postVersionId: string
}

export class FixWithAiPostNotFoundError extends Error {
  constructor(postId: string) {
    super(`Post ${postId} not found`)
    this.name = 'FixWithAiPostNotFoundError'
  }
}

export class FixWithAiThreadMismatchError extends Error {
  constructor(threadId: string, postId: string) {
    super(`Thread ${threadId} does not belong to post ${postId}`)
    this.name = 'FixWithAiThreadMismatchError'
  }
}

/**
 * Pretty-print a comment's author for the prompt. Comments authored by an
 * AM (Clerk user) carry an author User row; comments left by a magic-link
 * reviewer carry a snapshotted reviewerName. Falls back to "Reviewer" when
 * neither resolves (defensive against SetNull cascades).
 */
function commentAuthorLabel(comment: {
  reviewerName: string | null
  author: { name: string | null } | null
}): string {
  if (comment.author?.name) return comment.author.name
  if (comment.reviewerName) return comment.reviewerName
  return 'Reviewer'
}

/**
 * Propose an AI rewrite of the post's caption based on the feedback in
 * `threadId`. Pure read, no DB writes. The caller (API route) wires
 * this into the DiffModal; AM either accepts (acceptFix) or closes.
 */
export async function proposeFix(input: ProposeFixInput): Promise<ProposeFixResult> {
  const { postId, threadId } = input

  const post = await db.post.findUnique({
    where: { id: postId },
    include: {
      client: {
        select: {
          name: true,
          brandVoice: true,
          dos: true,
          donts: true,
        },
      },
    },
  })
  if (!post) throw new FixWithAiPostNotFoundError(postId)
  if (!post.client) throw new FixWithAiPostNotFoundError(postId)

  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    include: {
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { name: true } } },
      },
    },
  })
  if (!thread) throw new FixWithAiThreadMismatchError(threadId, postId)
  if (thread.postId !== postId) {
    throw new FixWithAiThreadMismatchError(threadId, postId)
  }

  const { system, user } = buildFixWithAiPrompt({
    clientName: post.client.name,
    brandVoice: post.client.brandVoice,
    dos: post.client.dos,
    donts: post.client.donts,
    currentCaption: post.caption,
    comments: thread.comments.map((c) => ({
      author: commentAuthorLabel(c),
      body: c.body,
    })),
  })

  const config = AI_MODELS.captions
  const anthropic = new Anthropic()
  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : ''
  const proposedCaption = rawText.trim()

  const usage = response.usage
  const cost = calculateCost(config.model, {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  })

  return {
    proposedCaption,
    diff: diffText(post.caption, proposedCaption),
    tokenUsage: {
      in: cost.inputTokens,
      out: cost.outputTokens,
      costUsd: cost.usd,
    },
  }
}

/**
 * Accept an AI-proposed (or AM-edited) caption. Writes a new PostVersion,
 * updates Post.caption, auto-resolves the originating thread with the
 * standard reason, and emits a post_caption_ai_fixed ActivityEvent. The
 * version snapshot + post update + activity record commit atomically; the
 * thread resolve is best-effort outside the txn since resolveThread runs
 * its own transaction via the repository.
 */
export async function acceptFix(input: AcceptFixInput): Promise<AcceptFixResult> {
  const { postId, threadId, proposedCaption, acceptedBy } = input

  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      clientId: true,
      caption: true,
      hashtags: true,
      graphicHook: true,
      designerNotes: true,
    },
  })
  if (!post) throw new FixWithAiPostNotFoundError(postId)

  const thread = await db.postThread.findUnique({
    where: { id: threadId },
    select: { id: true, postId: true },
  })
  if (!thread) throw new FixWithAiThreadMismatchError(threadId, postId)
  if (thread.postId !== postId) {
    throw new FixWithAiThreadMismatchError(threadId, postId)
  }

  const oldCaption = post.caption

  const versionResult = await db.$transaction(async (tx) => {
    const version = await tx.postVersion.create({
      data: {
        postId,
        authorId: acceptedBy,
        caption: proposedCaption,
        hashtags: post.hashtags,
        graphicHook: post.graphicHook,
        designerNotes: post.designerNotes,
      },
      select: { id: true },
    })

    await tx.post.update({
      where: { id: postId },
      data: { caption: proposedCaption },
    })

    return version
  })

  // Auto-resolve the originating thread (idempotent in the repo). Run
  // outside the transaction above because the repository wraps its own.
  await resolveThread({
    threadId,
    resolvedBy: acceptedBy,
    resolvedReason: 'Resolved via Fix with AI',
  })

  // Activity event for the client thread. recordActivity swallows errors
  // internally so a failed activity write cannot abort the caption change.
  await recordActivity({
    clientId: post.clientId,
    postId,
    actorId: acceptedBy,
    kind: ActivityKind.post_caption_ai_fixed,
    payload: {
      postId,
      threadId,
      oldCaption,
      newCaption: proposedCaption,
      postVersionId: versionResult.id,
    },
  })

  return { postVersionId: versionResult.id }
}

import { db } from '@/db/client'
import { sendEmail } from '@/lib/resend'
import { signToken } from '@/lib/magic-link'
import { AmReplyEmail, buildAmReplySubject } from '@/server/emails/AmReplyEmail'
import React from 'react'

const COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/**
 * Email the client when an AM replies to one of their threads. Coalesced via
 * an atomic cooldown claim on MagicLink.replyEmailSentAt. Never throws.
 */
export async function notifyClientOfAmReply(input: {
  threadId: string
  amUserId: string
}): Promise<void> {
  try {
    const thread = await db.postThread.findUnique({
      where: { id: input.threadId },
      select: {
        reviewerToken: true,
        post: { select: { batch: { select: { client: { select: { name: true } } } } } },
      },
    })
    if (!thread?.reviewerToken) return

    const link = await db.magicLink.findUnique({
      where: { tokenHash: thread.reviewerToken },
      select: { id: true, expiresAt: true, defaultReviewerEmail: true, defaultReviewerName: true },
    })
    if (!link) return

    const cutoff = new Date(Date.now() - COOLDOWN_MS)
    const claim = await db.magicLink.updateMany({
      where: { id: link.id, OR: [{ replyEmailSentAt: null }, { replyEmailSentAt: { lt: cutoff } }] },
      data: { replyEmailSentAt: new Date() },
    })
    if (claim.count === 0) return // coalesced

    if (!link.defaultReviewerEmail) return // claimed, nothing to send

    const clientName = thread.post.batch?.client?.name ?? ''

    const am = await db.user.findUnique({
      where: { id: input.amUserId },
      select: { name: true, email: true },
    })

    const token = signToken({ magicLinkId: link.id, expiresAt: link.expiresAt.getTime() })
    const reviewUrl = `${appBaseUrl()}/review/${token}`
    const props = {
      reviewerName: link.defaultReviewerName,
      clientName,
      amName: am?.name ?? 'Your account manager',
      reviewUrl,
    }

    await sendEmail({
      to: link.defaultReviewerEmail,
      subject: buildAmReplySubject(props),
      react: React.createElement(AmReplyEmail, props),
      replyTo: am?.email ?? undefined,
    })
  } catch (err) {
    console.error('[notifyClientOfAmReply] failed', err)
  }
}

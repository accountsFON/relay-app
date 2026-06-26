import { db } from '@/db/client'
import { sendEmail } from '@/lib/resend'
import { signToken } from '@/lib/magic-link'
import { AmReplyEmail, buildAmReplySubject } from '@/server/emails/AmReplyEmail'
import React from 'react'

const COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

function appBaseUrl(): string {
  // Mirror the canonical chain in src/server/actions/magicLink.ts. The original
  // (NEXT_PUBLIC_APP_URL ?? localhost) sent every AM-reply email link to
  // localhost in prod, because NEXT_PUBLIC_APP_URL is not set there: the
  // client clicked the email and hit an error page. Fall back to the Vercel
  // prod alias / deployment URL like every other URL builder.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
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
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        batch: { select: { deletedAt: true } },
        defaultReviewerEmail: true,
        defaultReviewerName: true,
      },
    })
    if (!link) return

    // The email re-mints a token and links to /review/[token]. Middleware 404s
    // an expired token and 410s a revoked link or archived batch, so emailing a
    // dead link sends the client straight to an error page. Mirror the
    // middleware guard here (before claiming the cooldown, so a dead link
    // doesn't burn the 30-min window) and just no-op.
    if (link.revokedAt || link.batch?.deletedAt || link.expiresAt.getTime() <= Date.now()) {
      return
    }

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

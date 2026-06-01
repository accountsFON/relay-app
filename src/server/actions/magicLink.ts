'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import {
  createMagicLink,
  revokeLink,
} from '@/server/repositories/magicLinks'
import { recordActivity } from '@/server/services/activity'
import { sendMagicLinkEmail } from '@/server/services/sendMagicLinkEmail'
import { db } from '@/db/client'

const MIN_EXPIRY_DAYS = 1
const MAX_EXPIRY_DAYS = 90
const DEFAULT_EXPIRY_DAYS = 30

function appBaseUrl(): string {
  // Mirrors the pattern from src/app/(app)/admin/users/invite-actions.ts —
  // prefer the friendly prod alias over per-deployment URLs.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function monthLabel(d: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function isValidEmail(email: string): boolean {
  // Conservative shape check; the worker re-validates server-side.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export interface CreateAndSendMagicLinkInput {
  batchId: string
  recipientName: string
  recipientEmail: string
  expiresInDays?: number
}

export interface CreateAndSendMagicLinkResult {
  magicLinkId: string
  reviewUrl: string
  expiresAt: Date
  emailSent: boolean
  emailError: string | null
}

/**
 * Mints a magic link for the given batch, sends the email via fon-email,
 * and emits a magic_link_created ActivityEvent.
 *
 * Auth: requires client.edit (AM, designer-admin, admin). The batch
 * lookup is scoped to the user's accessible clients via findClientForUser,
 * so cross-org / cross-scope batchIds 404.
 *
 * Email failure does NOT roll back the magic link. The AM gets the URL
 * in the response and can copy it manually, the alternative (rolling
 * back) leaves the AM with no link at all and no way to recover. We
 * surface the email error in the result so the UI can flag it.
 */
export async function createAndSendMagicLinkAction(
  input: CreateAndSendMagicLinkInput,
): Promise<CreateAndSendMagicLinkResult> {
  const ctx = await requireClientEditor()

  const name = input.recipientName?.trim()
  const email = input.recipientEmail?.trim()
  if (!name) throw new Error('Recipient name is required')
  if (!email || !isValidEmail(email)) {
    throw new Error('Recipient email is required and must be a valid address')
  }

  const days = clampDays(input.expiresInDays ?? DEFAULT_EXPIRY_DAYS)

  // Look up the batch + scoped to the caller's accessible clients.
  const batch = await findBatch(input.batchId)
  if (!batch) notFound()
  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) notFound()

  // Defense in depth on top of the UI gate (RelayTrack + batch detail
  // hide the Send review link button when this flag is off). If a
  // caller bypasses the UI by invoking the action directly, the mint
  // still fails before any side effect: no row, no email worker call.
  if (!batch.clientReviewEnabled) {
    throw new Error(
      'Client Review is off for this client. Turn it on in the client form to send a review link.',
    )
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const { link, token } = await createMagicLink({
    batchId: batch.id,
    defaultReviewerName: name,
    defaultReviewerEmail: email,
    expiresAt,
    createdBy: ctx.userDbId,
  })

  const reviewUrl = `${appBaseUrl()}/review/${token}`

  // ActivityEvent first so the audit trail records "link generated" even
  // if the email later fails.
  await recordActivity({
    clientId: batch.clientId,
    actorId: ctx.userDbId,
    kind: ActivityKind.magic_link_created,
    visibility: EventVisibility.internal,
    payload: {
      magicLinkId: link.id,
      batchId: batch.id,
      recipientName: name,
      recipientEmail: email,
      expiresAt: expiresAt.toISOString(),
    },
  })

  // Resolve AM display name (fall back to email if name is unset).
  const am = await db.user.findUnique({
    where: { id: ctx.userDbId },
    select: { name: true, email: true },
  })
  const senderName = am?.name?.trim() || am?.email || 'Your Five One Nine team'

  let emailSent = false
  let emailError: string | null = null
  try {
    await sendMagicLinkEmail({
      recipientName: name,
      recipientEmail: email,
      senderName,
      clientName: client.name,
      monthLabel: monthLabel(batch.scheduledAt ?? batch.createdAt),
      reviewUrl,
      expiresAt,
    })
    emailSent = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err)
    console.error('[magic-link] sendMagicLinkEmail failed', {
      magicLinkId: link.id,
      err: emailError,
    })
  }

  revalidatePath(`/clients/${batch.clientId}/batches/${batch.id}`)

  return {
    magicLinkId: link.id,
    reviewUrl,
    expiresAt,
    emailSent,
    emailError,
  }
}

export interface RevokeMagicLinkInput {
  id: string
}

/**
 * Revokes a magic link. Verifies the caller has client.edit on the
 * link's underlying batch's client before flipping revokedAt, prevents
 * a tampered id from one org being used to revoke a link in another.
 */
export async function revokeMagicLinkAction(
  input: RevokeMagicLinkInput,
): Promise<{ ok: true }> {
  const ctx = await requireClientEditor()

  const link = await db.magicLink.findUnique({
    where: { id: input.id },
    select: { id: true, batchId: true },
  })
  if (!link) notFound()

  const batch = await findBatch(link.batchId)
  if (!batch) notFound()
  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) notFound()

  await revokeLink({ id: link.id, by: ctx.userDbId })

  revalidatePath(`/clients/${batch.clientId}/batches/${batch.id}`)
  return { ok: true }
}

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EXPIRY_DAYS
  const i = Math.round(n)
  if (i < MIN_EXPIRY_DAYS) return MIN_EXPIRY_DAYS
  if (i > MAX_EXPIRY_DAYS) return MAX_EXPIRY_DAYS
  return i
}

interface RotateContext {
  ctx: Awaited<ReturnType<typeof requireClientEditor>>
  oldLink: {
    id: string
    batchId: string
    defaultReviewerName: string
    defaultReviewerEmail: string
    expiresAt: Date
  }
  batch: NonNullable<Awaited<ReturnType<typeof findBatch>>>
  client: NonNullable<Awaited<ReturnType<typeof findClientForUser>>>
  newLink: { id: string }
  token: string
  reviewUrl: string
}

/**
 * Shared rotation core for Copy URL / Open Preview / Resend Email.
 *
 * We do not store the raw token on the MagicLink row (only a sha256
 * hash) so once the original modal closes there is no way to surface
 * the original URL again. Rather than weaken the model, we rotate:
 * mint a fresh MagicLink with the same recipient + expiresAt, revoke
 * the old one, and return the new URL.
 *
 * Side effect: any prior reviewer sessions stay attached to the old
 * (now revoked) link. New visits use the new link. That is acceptable
 * because the AM only reaches for these buttons when they need to
 * re-deliver / share the URL again, which implies the original is no
 * longer in active use.
 */
async function rotateLinkForAction(id: string): Promise<RotateContext> {
  const ctx = await requireClientEditor()

  const oldLink = await db.magicLink.findUnique({
    where: { id },
    select: {
      id: true,
      batchId: true,
      defaultReviewerName: true,
      defaultReviewerEmail: true,
      expiresAt: true,
      revokedAt: true,
    },
  })
  if (!oldLink) notFound()
  if (oldLink.revokedAt) {
    throw new Error('This link has already been revoked. Send a new one from the batch page.')
  }

  const batch = await findBatch(oldLink.batchId)
  if (!batch) notFound()
  const client = await findClientForUser(ctx, batch.clientId)
  if (!client) notFound()

  // Keep the existing expiry; never silently extend a link's lifetime
  // just because the AM clicked Copy. If the link has already expired
  // we still rotate (the recipient hit a wall and the AM wants to fix
  // it) by pushing the expiry out one default cycle.
  let expiresAt = oldLink.expiresAt
  if (expiresAt.getTime() <= Date.now()) {
    expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  }

  const { link: newLink, token } = await createMagicLink({
    batchId: batch.id,
    defaultReviewerName: oldLink.defaultReviewerName,
    defaultReviewerEmail: oldLink.defaultReviewerEmail,
    expiresAt,
    createdBy: ctx.userDbId,
  })

  // Revoke the old row only after the new one is minted so an interruption
  // never leaves the AM with zero usable links.
  await revokeLink({ id: oldLink.id, by: ctx.userDbId })

  const reviewUrl = `${appBaseUrl()}/review/${token}`

  return {
    ctx,
    oldLink: {
      id: oldLink.id,
      batchId: oldLink.batchId,
      defaultReviewerName: oldLink.defaultReviewerName,
      defaultReviewerEmail: oldLink.defaultReviewerEmail,
      expiresAt: oldLink.expiresAt,
    },
    batch,
    client,
    newLink: { id: newLink.id },
    token,
    reviewUrl,
  }
}

export interface GetFreshUrlForLinkInput {
  id: string
}

export interface GetFreshUrlForLinkResult {
  url: string
  magicLinkId: string
  expiresAt: Date
}

/**
 * Rotates the MagicLink and returns a fresh usable URL without sending
 * email. Backs the Copy URL and Open Preview buttons on MagicLinkRow.
 */
export async function getFreshUrlForLinkAction(
  input: GetFreshUrlForLinkInput,
): Promise<GetFreshUrlForLinkResult> {
  const rotated = await rotateLinkForAction(input.id)

  await recordActivity({
    clientId: rotated.batch.clientId,
    actorId: rotated.ctx.userDbId,
    kind: ActivityKind.magic_link_created,
    visibility: EventVisibility.internal,
    payload: {
      magicLinkId: rotated.newLink.id,
      batchId: rotated.batch.id,
      recipientName: rotated.oldLink.defaultReviewerName,
      recipientEmail: rotated.oldLink.defaultReviewerEmail,
      rotatedFrom: rotated.oldLink.id,
      reason: 'fresh_url',
    },
  })

  revalidatePath(`/clients/${rotated.batch.clientId}/batches/${rotated.batch.id}`)

  return {
    url: rotated.reviewUrl,
    magicLinkId: rotated.newLink.id,
    expiresAt: rotated.oldLink.expiresAt,
  }
}

export interface ResendMagicLinkEmailInput {
  id: string
}

export interface ResendMagicLinkEmailResult {
  ok: boolean
  newUrl: string
  magicLinkId: string
  emailSent: boolean
  emailError: string | null
}

/**
 * Rotates the MagicLink and re-sends the MagicLinkInviteEmail to the
 * same recipient. The new URL is also returned so the AM can copy it
 * if they prefer not to rely on the email.
 *
 * Email failure does NOT roll back the new link; same recovery model
 * as createAndSendMagicLinkAction.
 */
export async function resendMagicLinkEmailAction(
  input: ResendMagicLinkEmailInput,
): Promise<ResendMagicLinkEmailResult> {
  const rotated = await rotateLinkForAction(input.id)

  await recordActivity({
    clientId: rotated.batch.clientId,
    actorId: rotated.ctx.userDbId,
    kind: ActivityKind.magic_link_created,
    visibility: EventVisibility.internal,
    payload: {
      magicLinkId: rotated.newLink.id,
      batchId: rotated.batch.id,
      recipientName: rotated.oldLink.defaultReviewerName,
      recipientEmail: rotated.oldLink.defaultReviewerEmail,
      rotatedFrom: rotated.oldLink.id,
      reason: 'resend',
    },
  })

  const am = await db.user.findUnique({
    where: { id: rotated.ctx.userDbId },
    select: { name: true, email: true },
  })
  const senderName = am?.name?.trim() || am?.email || 'Your Five One Nine team'

  let emailSent = false
  let emailError: string | null = null
  try {
    await sendMagicLinkEmail({
      recipientName: rotated.oldLink.defaultReviewerName,
      recipientEmail: rotated.oldLink.defaultReviewerEmail,
      senderName,
      clientName: rotated.client.name,
      monthLabel: monthLabel(rotated.batch.scheduledAt ?? rotated.batch.createdAt),
      reviewUrl: rotated.reviewUrl,
      expiresAt: rotated.oldLink.expiresAt,
    })
    emailSent = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err)
    console.error('[magic-link] resend sendMagicLinkEmail failed', {
      magicLinkId: rotated.newLink.id,
      err: emailError,
    })
  }

  revalidatePath(`/clients/${rotated.batch.clientId}/batches/${rotated.batch.id}`)

  return {
    ok: true,
    newUrl: rotated.reviewUrl,
    magicLinkId: rotated.newLink.id,
    emailSent,
    emailError,
  }
}

/**
 * Magic-link persistence layer.
 *
 * Three responsibilities:
 *   1. createMagicLink: mint a fresh signed token, store only its hash,
 *      hand the raw token back to the caller (single chance, the email
 *      pipeline is the only legitimate destination).
 *   2. findByTokenHash: request-time lookup used by the /review/[token]
 *      middleware after HMAC + expiry check.
 *   3. revokeLink / recordReviewer / findReviewerBySession: link
 *      lifecycle and per-visitor identity.
 *
 * No auth gating in this layer, server actions on top resolve Clerk
 * identity for create/revoke and magic-link session identity for
 * recordReviewer. Mirrors the existing repository pattern in
 * src/server/repositories/clients.ts and batches.ts.
 */
import type { MagicLink, MagicLinkReviewer, Batch } from '@prisma/client'
import { db } from '@/db/client'
import { hashToken, signToken } from '@/lib/magic-link'

export interface CreateMagicLinkInput {
  batchId: string
  defaultReviewerName: string
  defaultReviewerEmail: string
  /** Unix epoch ms. Caller computes from days-from-now or batch archive horizon. */
  expiresAt: Date
  /** Clerk user id of the AM minting the link. */
  createdBy: string
}

export interface CreateMagicLinkResult {
  link: MagicLink
  /**
   * Raw signed token. NEVER persisted; the only place it appears is
   * in the email URL the AM sends to the client. Subsequent reads
   * use findByTokenHash.
   */
  token: string
}

/**
 * Mints a new MagicLink:
 *   1. Generate a cuid for the row id (Prisma default at insert).
 *   2. Sign a token bound to that id + expiresAt.
 *   3. Persist the sha256 of the token as tokenHash.
 *   4. Return both the persisted row and the raw token.
 *
 * The id has to be known up front so the token can carry it; we
 * generate it via a temporary insert + update? No, Prisma's @default(cuid())
 * is computed by the client before send, so we can pre-compute by
 * creating with no token first. Simpler: do a two-phase insert in a
 * transaction (create row to get the id, then sign + update tokenHash).
 */
export async function createMagicLink(
  input: CreateMagicLinkInput,
): Promise<CreateMagicLinkResult> {
  const expiresAtMs = input.expiresAt.getTime()
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('createMagicLink: expiresAt must be a future date')
  }

  return db.$transaction(async (tx) => {
    // Two-phase so the id baked into the token matches the persisted row.
    // tokenHash is non-null in schema; use a placeholder unique-per-call
    // value on the first insert and overwrite immediately. Using the
    // row id as the placeholder guarantees uniqueness without a second
    // round-trip to fetch a candidate id.
    const placeholder = `pending:${Math.random().toString(36).slice(2)}:${Date.now()}`
    const draft = await tx.magicLink.create({
      data: {
        batchId: input.batchId,
        tokenHash: placeholder,
        defaultReviewerName: input.defaultReviewerName,
        defaultReviewerEmail: input.defaultReviewerEmail,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
      },
    })

    const token = signToken({ magicLinkId: draft.id, expiresAt: expiresAtMs })
    const tokenHash = hashToken(token)

    const link = await tx.magicLink.update({
      where: { id: draft.id },
      data: { tokenHash },
    })

    return { link, token }
  })
}

export type MagicLinkWithBatch = MagicLink & { batch: Batch }

/**
 * Fast path used by middleware on every /review/[token] request. Single
 * indexed lookup on tokenHash (unique). Returns the batch eagerly so the
 * middleware can short-circuit on archived batches without a follow-up.
 */
export async function findByTokenHash(
  tokenHash: string,
): Promise<MagicLinkWithBatch | null> {
  return db.magicLink.findUnique({
    where: { tokenHash },
    include: { batch: true },
  })
}

export interface RevokeLinkInput {
  id: string
  /** Clerk user id of the AM clicking revoke. Recorded for audit downstream. */
  by: string
}

/**
 * Idempotent: re-revoking a revoked link is a no-op; the original
 * revokedAt is preserved so audit trails do not drift.
 */
export async function revokeLink({ id }: RevokeLinkInput): Promise<void> {
  // Conditional update so we do not overwrite a prior revokedAt timestamp.
  await db.magicLink.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export interface RecordReviewerInput {
  magicLinkId: string
  name: string
  email?: string
  /** Stable id from the signed cookie session. Same value on every visit. */
  sessionId: string
}

/**
 * Upsert by sessionId:
 *   - First insert sets firstSeen + lastSeen to now (Prisma defaults).
 *   - Subsequent visits only bump lastSeen + (optionally) latest name/email.
 *
 * We do not move firstSeen on an existing row, that field is the audit
 * anchor for "when did this client first read the batch".
 */
export async function recordReviewer(
  input: RecordReviewerInput,
): Promise<MagicLinkReviewer> {
  const now = new Date()
  return db.magicLinkReviewer.upsert({
    where: { sessionId: input.sessionId },
    create: {
      magicLinkId: input.magicLinkId,
      name: input.name,
      email: input.email ?? null,
      sessionId: input.sessionId,
      firstSeen: now,
      lastSeen: now,
    },
    update: {
      lastSeen: now,
      // Allow the reviewer to correct a typo on a return visit.
      name: input.name,
      email: input.email ?? null,
    },
  })
}

export async function findReviewerBySession(
  sessionId: string,
): Promise<MagicLinkReviewer | null> {
  return db.magicLinkReviewer.findUnique({ where: { sessionId } })
}

/**
 * Auto-route a client's magic-link pins to the designer on review submit.
 *
 * When a client leaves a pin through their review link they are asking for the
 * design to change, so an AM hand-clicking "Flag for designer" on each one only
 * confirms the obvious. This creates those DesignerFlag rows for them.
 *
 * Three things worth knowing before changing this:
 *
 *  1. A flag does NOT notify the designer. Engagement happens on the AM's
 *     explicit "Send to designer" (requestDesignChangesAction), which sets the
 *     awaiting_design_revisions sub-state and notifies. So this pre-fills the
 *     AM's triage list without pinging anyone, and the AM can still unflag.
 *
 *  2. Caption pins are deliberately excluded. The codebase treats caption edits
 *     as the AM's work: review-feedback-rail hides the flag control for
 *     caption_edited because the AM accepts or rejects that copy inline. Flagging
 *     them would hand the designer work they do not own.
 *
 *  3. DesignerFlag.createdById is a required User FK and a magic-link reviewer is
 *     a MagicLinkReviewer, not a User. The caller passes MagicLink.createdBy (the
 *     AM who sent the link), which is itself non-null, so no nullable column and
 *     no migration. The client's assigned AM was rejected as the source: that
 *     column is nullable and a null one already caused a false "notifications are
 *     broken" report on 2026-08-13.
 *
 * Best effort by contract: the caller must not let a failure here roll back the
 * client's submission. Mirrors the Drive-upload side effect from PR #425.
 *
 * Spec: docs/superpowers/specs/2026-08-17-auto-flag-client-pins-design.md
 */
import { db } from '@/db/client'
import { createDesignerFlag } from '@/server/repositories/designerFlags'

/** The columns needed to classify a pin's kind, nothing more. */
export interface ClientPinRow {
  id: string
  postId: string
  imageX: number | null
  imageY: number | null
  captionFrom: number | null
  captionTo: number | null
}

export interface AutoFlagDeps {
  /** Open, CLIENT-authored threads on the batch (reviewerToken not null). */
  listOpenClientPins: (batchId: string) => Promise<ClientPinRow[]>
  /** Thread ids on the batch that already carry a flag. */
  listFlaggedThreadIds: (batchId: string) => Promise<Set<string>>
  createFlag: (input: {
    batchId: string
    postId: string
    threadId: string
    note: null
    createdById: string
  }) => Promise<{ id: string }>
}

export interface AutoFlagClientPinsInput {
  batchId: string
  /** MagicLink.createdBy: the AM who sent the link. Always a real User. */
  createdById: string
}

export interface AutoFlagClientPinsResult {
  flagged: number
  skippedCaption: number
  skippedExisting: number
}

/**
 * A caption pin carries both caption offsets and no image coordinates. Matches
 * the kind derivation the submit digest already uses for DigestPin.
 */
function isCaptionPin(pin: ClientPinRow): boolean {
  return pin.captionFrom !== null && pin.captionTo !== null
}

const defaultDeps: AutoFlagDeps = {
  listOpenClientPins: (batchId) =>
    db.postThread.findMany({
      where: {
        post: { batchId },
        status: 'open',
        reviewerToken: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        postId: true,
        imageX: true,
        imageY: true,
        captionFrom: true,
        captionTo: true,
      },
    }),

  listFlaggedThreadIds: async (batchId) => {
    const rows = await db.designerFlag.findMany({
      where: { batchId, threadId: { not: null } },
      select: { threadId: true },
    })
    return new Set(
      rows
        .map((r) => r.threadId)
        .filter((id): id is string => id !== null),
    )
  },

  createFlag: (input) => createDesignerFlag(input),
}

export async function autoFlagClientPins(
  input: AutoFlagClientPinsInput,
  deps: AutoFlagDeps = defaultDeps,
): Promise<AutoFlagClientPinsResult> {
  const pins = await deps.listOpenClientPins(input.batchId)
  if (pins.length === 0) {
    return { flagged: 0, skippedCaption: 0, skippedExisting: 0 }
  }

  const alreadyFlagged = await deps.listFlaggedThreadIds(input.batchId)

  let flagged = 0
  let skippedCaption = 0
  let skippedExisting = 0

  for (const pin of pins) {
    if (isCaptionPin(pin)) {
      skippedCaption += 1
      continue
    }
    if (alreadyFlagged.has(pin.id)) {
      skippedExisting += 1
      continue
    }
    await deps.createFlag({
      batchId: input.batchId,
      postId: pin.postId,
      threadId: pin.id,
      // Left null on purpose: the rail renders a null-note flag as
      // "Revise this item", and inventing an AM instruction would put words in
      // their mouth.
      note: null,
      createdById: input.createdById,
    })
    flagged += 1
  }

  return { flagged, skippedCaption, skippedExisting }
}

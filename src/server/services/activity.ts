import type { Prisma, PrismaClient } from '@prisma/client'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { db } from '@/db/client'

export { ActivityKind, EventVisibility }

export type ActivityPayload = Record<string, unknown>

type DbOrTx = PrismaClient | Prisma.TransactionClient

export interface RecordActivityInput {
  clientId: string
  runId?: string | null
  postId?: string | null
  actorId?: string | null
  kind: ActivityKind
  /**
   * Who can see this event in activity threads / search results.
   * Defaults to `internal` (agency-only). Set explicitly for client-facing
   * events (`public`) or sensitive audit entries (`admin_only`).
   * Spec § Future Features § Section 2 — visibility rules.
   */
  visibility?: EventVisibility
  payload: ActivityPayload
  mentionedUserIds?: string[]
}

/**
 * Insert an ActivityEvent (and optional Mention rows) on the given client.
 *
 * MUST NOT throw. Wraps the write in try/catch and logs on failure so an
 * activity-record failure cannot abort the upstream state mutation.
 *
 * Pass `tx` when the caller is inside a Prisma transaction so the activity
 * row commits atomically with the state change (Split A in the spec).
 */
export async function recordActivity(
  input: RecordActivityInput,
  tx?: DbOrTx,
): Promise<{ id: string } | null> {
  const client = tx ?? db
  try {
    const event = await client.activityEvent.create({
      data: {
        clientId: input.clientId,
        runId: input.runId ?? null,
        postId: input.postId ?? null,
        actorId: input.actorId ?? null,
        kind: input.kind,
        visibility: input.visibility ?? defaultVisibilityForKind(input.kind),
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        mentions: input.mentionedUserIds?.length
          ? {
              create: dedupe(input.mentionedUserIds).map((mentionedUserId) => ({
                mentionedUserId,
              })),
            }
          : undefined,
      },
      select: { id: true },
    })
    return event
  } catch (err) {
    console.error('[activity] recordActivity failed', {
      clientId: input.clientId,
      kind: input.kind,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

import type { Prisma } from '@prisma/client'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { tasks } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import type { DbClient, DbTx } from '@/db/client'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

export { ActivityKind, EventVisibility }

export type ActivityPayload = Record<string, unknown>

type DbOrTx = DbClient | DbTx

/**
 * Schedule tapper two for notification rollup emails.
 *
 * Best effort and completely silent on failure: recordActivity's contract is
 * that it must not throw, and a Trigger.dev hiccup must never cost us an
 * activity row. If this scheduling is lost, the bell poll tapper still sends
 * the pile.
 *
 * The idempotency key is bucketed to the current five minute window, so a
 * burst of mentions in one window produces a single delayed run.
 */
async function scheduleNotificationEmailTimer(): Promise<void> {
  try {
    await tasks.trigger(
      'notification-email-timer',
      {},
      {
        delay: '5m',
        idempotencyKey: `notif-email-${Math.floor(Date.now() / ROLLUP_WINDOW_MS)}`,
        idempotencyKeyTTL: '15m',
      },
    )
  } catch (err) {
    console.error('[activity] notification email timer scheduling failed', {
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

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
   * Spec § Future Features § Section 2, visibility rules.
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
    if (input.mentionedUserIds?.length) {
      await scheduleNotificationEmailTimer()
    }
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

/**
 * Default ActivityEvent visibility when the caller doesn't pass one.
 * Spec § Future Features § Section 2, visibility rules.
 *
 * Conservative default: only `comment` is public, sensitive admin actions
 * are `admin_only`, everything else is `internal`. Call sites that want a
 * client-facing batch transition (e.g. `batch_passed` when the next holder
 * is the client) MUST pass `visibility: EventVisibility.public` explicitly.
 *
 * Rationale: prevents accidental client exposure when a new emit site is
 * added without considering visibility. Matches the original Phase A draft.
 */
function defaultVisibilityForKind(kind: ActivityKind): EventVisibility {
  switch (kind) {
    case ActivityKind.comment:
      return EventVisibility.public
    case ActivityKind.member_role_changed:
    case ActivityKind.member_removed:
    case ActivityKind.client_archived:
      return EventVisibility.admin_only
    default:
      return EventVisibility.internal
  }
}

/**
 * Per-spec seed helpers for the notification bell + preview submit + failed
 * run E2E specs. Each helper inserts the minimum DB state needed for the
 * assertions in `e2e/am/notification-bell.spec.ts`,
 * `e2e/am/preview-submit.spec.ts`, and `e2e/am/failed-run-bell.spec.ts`.
 *
 * Why direct Prisma writes instead of going through server actions: the
 * specs need deterministic state regardless of which order other specs run
 * in. The auth.setup.ts seed plants Morgan's base 4 unread mentions; these
 * helpers add scenario-specific rows on top without disturbing that
 * baseline. The bell only reads Mention rows on ActivityEvent rows scoped
 * by org, so writing them directly is the smallest surface that exercises
 * the bell's data path end to end.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 16
 */
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { readSeedData } from './data'

loadEnv({ path: '.env.local' })

function makePrisma(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  const pool = new Pool({ connectionString: url })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter, log: ['error'] })
}

export interface BatchWithMarkupCommentsResult {
  /** Batch the AM persona can preview. Picked from Morgan's assigned clients. */
  batchId: string
  /** Client the batch belongs to (Morgan owns it). */
  clientId: string
  /** Cleanup hook: removes the threads/comments + activity rows the helper
   *  inserted so a re-run sees a clean baseline. The activity_events scoped
   *  by createdAt > startedAt avoids touching the seed's own events. */
  cleanup: () => Promise<void>
}

/**
 * Seeds N open PostThread + PostComment rows on the most-recent in_design or
 * am_qa_pre_client batch owned by Morgan's client (Cedar Creek Dental).
 * The AM-authored comments are what `submitPreviewReviewAction` counts to
 * decide whether to fire the `preview_review_submitted` ActivityEvent.
 *
 * commentCount = 0 short-circuits and only resolves the batch + client so
 * the spec can assert the "No comments to send" disabled state.
 */
export async function batchWithAmMarkupComments(opts: {
  commentCount: number
}): Promise<BatchWithMarkupCommentsResult> {
  const seed = readSeedData()
  const amId = seed.users.am1.id
  const clientId = seed.clients.cedarCreekDental.id

  const db = makePrisma()
  try {
    // Pre-clean any leftover state from prior runs. The previous test may
    // have crashed before its finally-cleanup, leaving Cedar Creek with
    // dangling preview_review_submitted events + Mentions for Riley.
    // Deleting on `clientId + kind` is targeted enough that we never
    // touch the demo seed's own activity rows (the demo doesn't plant
    // preview_review_submitted; that kind only appears via the submit
    // action).
    await db.activityEvent.deleteMany({
      where: {
        clientId,
        kind: 'preview_review_submitted',
      },
    })

    // Also wipe any AM-authored open threads left from prior runs that
    // crashed before cleanup. Constraint to threads with the test-only
    // body marker so we never touch real seed comment threads (the demo
    // seed doesn't plant PostThread rows anyway, but be safe).
    await db.postThread.deleteMany({
      where: {
        createdBy: amId,
        comments: { some: { body: { startsWith: 'E2E markup comment' } } },
      },
    })

    // Pick a Cedar Creek batch that has posts attached. The
    // design_revisions batch in the demo seed sits on Mar with posts.
    const batch = await db.batch.findFirst({
      where: {
        clientId,
        deletedAt: null,
        posts: { some: { batchId: { not: null } } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, posts: { select: { id: true }, take: opts.commentCount || 1 } },
    })
    if (!batch) {
      throw new Error('No Cedar Creek batch with posts found; seed may be stale')
    }
    const batchId = batch.id
    const postIds = batch.posts.map((p) => p.id)

    // Resolve any existing AM-authored open threads on this batch so we
    // can include them in the count cleanup. We do not delete the seed's
    // own threads here; we only remove the ones we just created.
    const createdThreadIds: string[] = []

    if (opts.commentCount > 0) {
      for (let i = 0; i < opts.commentCount; i += 1) {
        const postId = postIds[i % postIds.length]
        const thread = await db.postThread.create({
          data: {
            postId,
            status: 'open',
            createdBy: amId,
            captionFrom: 0,
            captionTo: 5,
            comments: {
              create: {
                authorId: amId,
                body: `E2E markup comment ${i + 1}`,
              },
            },
          },
          select: { id: true },
        })
        createdThreadIds.push(thread.id)
      }
    }

    // Snapshot the AM-authored comment count we just produced so the
    // cleanup can also delete any preview_review_submitted ActivityEvent
    // the submit action emits during the test run.
    const startedAt = new Date(Date.now() - 1000)

    const cleanup = async (): Promise<void> => {
      const db2 = makePrisma()
      try {
        if (createdThreadIds.length > 0) {
          await db2.postThread.deleteMany({
            where: { id: { in: createdThreadIds } },
          })
        }
        await db2.activityEvent.deleteMany({
          where: {
            clientId,
            kind: 'preview_review_submitted',
            createdAt: { gte: startedAt },
          },
        })
      } finally {
        await db2.$disconnect()
      }
    }

    return { batchId, clientId, cleanup }
  } finally {
    await db.$disconnect()
  }
}

export interface FailedRunResult {
  runId: string
  clientId: string
  cleanup: () => Promise<void>
}

/**
 * Seeds a fresh ContentRun in `failed` + a `run_failed` ActivityEvent + a
 * Mention row for the AM (Morgan). The bell's summary route reads Mention
 * rows scoped by org so this is the minimum to make the FailedRunRow render.
 *
 * The job-side emit in `generateContent.ts` does NOT currently mint a
 * Mention for failed runs (T14 deliberately left run_failed to the
 * InFlightRuns provider before T12 stripped it from the pill). This helper
 * mints the Mention directly so the spec exercises the bell's row + actions
 * surface as soon as the page polls.
 */
export async function failedRunFor(): Promise<FailedRunResult> {
  const seed = readSeedData()
  const amId = seed.users.am1.id
  const clientId = seed.clients.cedarCreekDental.id

  const db = makePrisma()
  try {
    // Purge any leftover failed-run mentions for the AM from prior runs so
    // the bell starts each test with a known baseline (1 failed row).
    // Scoped to E2E-seeded events by the "E2E seeded failure" errorMessage
    // payload signature so we don't touch demo seed activity rows.
    await db.mention.deleteMany({
      where: {
        mentionedUserId: amId,
        event: {
          kind: 'run_failed',
          payload: { path: ['errorMessage'], equals: 'E2E seeded failure' },
        },
      },
    })
    await db.activityEvent.deleteMany({
      where: {
        kind: 'run_failed',
        payload: { path: ['errorMessage'], equals: 'E2E seeded failure' },
      },
    })
    await db.contentRun.deleteMany({
      where: {
        status: 'failed',
        errorMessage: 'E2E seeded failure',
      },
    })

    const run = await db.contentRun.create({
      data: {
        clientId,
        triggeredById: amId,
        targetMonth: '2026-05',
        status: 'failed',
        errorMessage: 'E2E seeded failure',
        startedAt: new Date(Date.now() - 60_000),
        completedAt: new Date(),
        acknowledgedAt: null,
      },
      select: { id: true },
    })

    const event = await db.activityEvent.create({
      data: {
        clientId,
        runId: run.id,
        actorId: null,
        kind: 'run_failed',
        visibility: 'internal',
        payload: {
          // notification-copy.ts switches on `payload.kind` for the rendered
          // summary string. Without this the row falls through to the
          // default "<actor> mentioned you." copy and the spec's
          // /content generation failed/i regex never matches.
          kind: 'run_failed',
          targetMonth: '2026-05',
          errorMessage: 'E2E seeded failure',
        },
        mentions: {
          create: { mentionedUserId: amId },
        },
      },
      select: { id: true },
    })

    const cleanup = async (): Promise<void> => {
      const db2 = makePrisma()
      try {
        // Mention rows cascade-delete via the ActivityEvent.mentions
        // relation when the event goes. The ContentRun -> ActivityEvent
        // cascade does the rest, but we delete in order to be explicit.
        await db2.mention.deleteMany({ where: { activityEventId: event.id } })
        await db2.activityEvent.deleteMany({ where: { id: event.id } })
        await db2.contentRun.delete({ where: { id: run.id } }).catch(() => {
          /* already gone */
        })
      } finally {
        await db2.$disconnect()
      }
    }

    return { runId: run.id, clientId, cleanup }
  } finally {
    await db.$disconnect()
  }
}

/**
 * Marks all of the AM persona's unread mentions read. Used by the bell's
 * empty-state spec to set a clean baseline before asserting the dropdown
 * shows the "all caught up" copy.
 *
 * Returns a list of mention ids that were marked read so the caller can
 * restore them in a cleanup step if needed (most specs don't bother — the
 * next test run reads the same fixture data).
 */
export async function markAllUnreadReadForAm(): Promise<string[]> {
  const seed = readSeedData()
  const amId = seed.users.am1.id
  const db = makePrisma()
  try {
    // Mark every unread Morgan-mention read, regardless of event kind.
    // Returned ids let the caller restore the unread state on test
    // teardown so parallel specs that rely on the seed unreads (the
    // notification-bell click-row test, for example) don't get poisoned
    // by this test running mid-stream.
    //
    // The bell's empty-state copy ("all caught up") requires global
    // zero unread on the viewing persona, not just "seed unreads zero".
    // Parallel failed-run-bell / preview-submit tests seed their own
    // mentions on Morgan; this helper marks those read too, and the
    // companion test ensures the test-owned rows are torn down within
    // their own finally blocks regardless of read state.
    const unread = await db.mention.findMany({
      where: { mentionedUserId: amId, readAt: null },
      select: { id: true },
    })
    await db.mention.updateMany({
      where: { mentionedUserId: amId, readAt: null },
      data: { readAt: new Date() },
    })
    return unread.map((m) => m.id)
  } finally {
    await db.$disconnect()
  }
}

/**
 * Restores read-state for the given mention ids (sets readAt back to null).
 * Pair with markAllUnreadReadForAm to keep the seed clean across spec runs.
 */
export async function restoreUnreadForMentions(mentionIds: string[]): Promise<void> {
  if (mentionIds.length === 0) return
  const db = makePrisma()
  try {
    await db.mention.updateMany({
      where: { id: { in: mentionIds } },
      data: { readAt: null },
    })
  } finally {
    await db.$disconnect()
  }
}

/**
 * Idempotent restore: forces every seed-owned comment mention on Morgan
 * back to unread. Use as a test.afterEach safety net so a crashed test
 * doesn't poison subsequent runs.
 *
 * Scoped to kind='comment' so we never re-surface a run_failed or
 * preview_review_submitted mention from a test that was supposed to
 * have torn it down.
 */
export async function restoreSeedUnreadForAm(): Promise<void> {
  const seed = readSeedData()
  const amId = seed.users.am1.id
  const db = makePrisma()
  try {
    await db.mention.updateMany({
      where: {
        mentionedUserId: amId,
        event: { kind: 'comment' },
      },
      data: { readAt: null },
    })
  } finally {
    await db.$disconnect()
  }
}

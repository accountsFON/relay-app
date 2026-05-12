/**
 * Demo seed: ~10 to 15 ActivityEvents per onboarded client covering every
 * kind referenced in the plan. Plus 9 Mentions distributed per the inbox
 * spec (4 unread Morgan, 2 unread Sam, 2 read Riley, 1 to Casey).
 *
 * Strategy: wipe demo activity rows first, then re emit. The demo activity
 * is fully derived from the seeded clients / runs / batches so a clean
 * rebuild is the simplest path to determinism.
 *
 * Timestamp spread: events are backdated across the last ~75 days so demo
 * activity feeds and inbox lists feel like a real working pipeline rather
 * than a single instant. Older clients onboarded longer ago; runs span
 * Feb / Mar / Apr; batches cluster in the last 2 weeks; mentions and
 * comments cluster in the last week or so. See `ageFor()` below.
 */
import type { Prisma } from '@prisma/client'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { recordActivity, type RecordActivityInput } from '@/server/services/activity'
import type { DbClient } from '@/db/client'
import type { SeededBatch } from './batches'
import type { SeededClient } from './clients'
import type { SeededContentRun } from './content-runs'
import type { SeededUserMap } from './users'

const COMMENTS_BY_INDUSTRY: Record<string, string[]> = {
  default: [
    'Looks great overall, can we tighten the CTA on a couple of these?',
    'Approved on this end. Schedule when ready.',
    'Heads up that the offer block needs a date update before send.',
    'Client mentioned wanting more before / after content next month.',
    'Quick QA: posts 2 and 7 mention the wrong neighborhood.',
    'Let me know when this lands in client review.',
    'Ready for designs after one more pass on the captions.',
    'Same brand voice issue as last month, locking the rule into the brief.',
  ],
}

interface MentionPlan {
  /** Which staff member is mentioned in the comment. */
  mentionUserKey: 'am1' | 'am2' | 'designer1' | 'client1'
  /** True if this mention should be marked read at seed time. */
  read: boolean
  body: string
}

const MENTION_PLANS: MentionPlan[] = [
  {
    mentionUserKey: 'am1',
    read: false,
    body: '@morgan.reyes can you take a look at the dental promo timing before we send?',
  },
  {
    mentionUserKey: 'am1',
    read: false,
    body: '@morgan.reyes client asked about adding a holiday hours post, pinging you for sign off.',
  },
  {
    mentionUserKey: 'am1',
    read: false,
    body: '@morgan.reyes the assets folder is missing the new headshot, can you nudge?',
  },
  {
    mentionUserKey: 'am1',
    read: false,
    body: '@morgan.reyes flagging a hashtag conflict on post 6, your call which to keep.',
  },
  {
    mentionUserKey: 'am2',
    read: false,
    body: '@sam.patel quick eyes on the photographer caption tone before we move on.',
  },
  {
    mentionUserKey: 'am2',
    read: false,
    body: '@sam.patel the brewery release post needs a venue update from the client.',
  },
  {
    mentionUserKey: 'designer1',
    read: true,
    body: '@riley.chen the cream warm token swap looks great, locking it in.',
  },
  {
    mentionUserKey: 'designer1',
    read: true,
    body: '@riley.chen one tiny crop fix on post 4, thumbnail had the logo cut.',
  },
  {
    mentionUserKey: 'client1',
    read: false,
    body: '@casey one quick approval needed on the May lineup.',
  },
]

interface SeedActivityResult {
  totalEvents: number
  totalMentions: number
}

function pickComment(industryKey: string, idx: number): string {
  const pool = COMMENTS_BY_INDUSTRY[industryKey] ?? COMMENTS_BY_INDUSTRY.default
  return pool[idx % pool.length]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000

function targetMonthDaysAgo(targetMonth: string, anchor: Date): number {
  const [yStr, mStr] = targetMonth.split('-')
  const y = Number.parseInt(yStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 30
  const refDay = new Date(y, m - 1, 15).getTime()
  const days = Math.round((anchor.getTime() - refDay) / MS_PER_DAY)
  return Math.max(2, days)
}

export async function seedActivity(
  db: DbClient,
  clients: SeededClient[],
  runs: SeededContentRun[],
  batches: SeededBatch[],
  org: SeededUserMap,
): Promise<SeedActivityResult> {
  const clientIds = clients.map((c) => c.id)
  await db.activityEvent.deleteMany({ where: { clientId: { in: clientIds } } })

  const now = new Date()
  const ageOf = (daysAgo: number, jitterHours = 0): Date =>
    new Date(now.getTime() - daysAgo * MS_PER_DAY - jitterHours * MS_PER_HOUR)

  const backdate = async (eventId: string, when: Date): Promise<void> => {
    await db.activityEvent.update({
      where: { id: eventId },
      data: { createdAt: when },
    })
    await db.mention.updateMany({
      where: { activityEventId: eventId },
      data: { createdAt: when },
    })
  }

  const recordAt = async (
    input: RecordActivityInput,
    when: Date,
  ): Promise<{ id: string } | null> => {
    const event = await recordActivity(input, db)
    if (event) await backdate(event.id, when)
    return event
  }

  let totalEvents = 0
  let totalMentions = 0
  let mentionCursor = 0

  const onboarded = clients.filter((c) => c.onboarded)
  const runsByClient = new Map<string, SeededContentRun[]>()
  for (const r of runs) {
    const list = runsByClient.get(r.clientId) ?? []
    list.push(r)
    runsByClient.set(r.clientId, list)
  }
  const batchesByClient = new Map<string, SeededBatch[]>()
  for (const b of batches) {
    const list = batchesByClient.get(b.clientId) ?? []
    list.push(b)
    batchesByClient.set(b.clientId, list)
  }

  // Spread client_created events across days 65..15 ago so older client cards
  // feel established, newer clients show as recent additions. Each client's
  // provisioning events (am_assigned, designer_assigned, profile_edited)
  // anchor to that client's onboarded date and step forward by hours/days.
  const clientCount = clients.length
  const oldestClientDays = 65
  const newestClientDays = 15
  const provisioningSpread = oldestClientDays - newestClientDays
  const clientOnboardedDaysAgo = (idx0: number): number => {
    if (clientCount <= 1) return oldestClientDays
    return oldestClientDays - Math.round((idx0 / (clientCount - 1)) * provisioningSpread)
  }

  for (let i = 0; i < clients.length; i += 1) {
    const client = clients[i]
    const triggerActor = client.amUserId ?? org.users.admin.id
    const onboardedDaysAgo = clientOnboardedDaysAgo(i)

    const created = await recordAt(
      {
        clientId: client.id,
        actorId: org.users.admin.id,
        kind: ActivityKind.client_created,
        visibility: EventVisibility.internal,
        payload: { name: client.name },
      },
      ageOf(onboardedDaysAgo),
    )
    if (created) totalEvents += 1

    if (client.amUserId) {
      const e = await recordAt(
        {
          clientId: client.id,
          actorId: org.users.admin.id,
          kind: ActivityKind.client_am_assigned,
          visibility: EventVisibility.internal,
          payload: { userId: client.amUserId },
        },
        ageOf(onboardedDaysAgo, -2),
      )
      if (e) totalEvents += 1
    }
    if (client.designerUserId) {
      const e = await recordAt(
        {
          clientId: client.id,
          actorId: org.users.admin.id,
          kind: ActivityKind.client_designer_assigned,
          visibility: EventVisibility.internal,
          payload: { userId: client.designerUserId },
        },
        ageOf(onboardedDaysAgo, -4),
      )
      if (e) totalEvents += 1
    }

    if (client.onboarded) {
      const e = await recordAt(
        {
          clientId: client.id,
          actorId: triggerActor,
          kind: ActivityKind.client_profile_edited,
          visibility: EventVisibility.internal,
          payload: {
            fieldsChanged: ['businessSummary', 'brandVoice', 'mainCta'],
          },
        },
        ageOf(Math.max(2, onboardedDaysAgo - 3)),
      )
      if (e) totalEvents += 1
    }
  }

  for (let oi = 0; oi < onboarded.length; oi += 1) {
    const client = onboarded[oi]
    const triggerActor = client.amUserId ?? org.users.admin.id
    const runsForClient = runsByClient.get(client.id) ?? []

    for (const run of runsForClient) {
      const runDaysAgo = targetMonthDaysAgo(run.targetMonth, now)
      // run_started is logged a few hours before run_completed, both within
      // the same calendar day relative to the run's target month anchor.
      const startedE = await recordAt(
        {
          clientId: client.id,
          runId: run.id,
          actorId: triggerActor,
          kind: ActivityKind.run_started,
          visibility: EventVisibility.internal,
          payload: { targetMonth: run.targetMonth },
        },
        ageOf(runDaysAgo, 4),
      )
      const completedE = await recordAt(
        {
          clientId: client.id,
          runId: run.id,
          actorId: triggerActor,
          kind: ActivityKind.run_completed,
          visibility: EventVisibility.public,
          payload: { targetMonth: run.targetMonth, posts: run.postIds.length },
        },
        ageOf(runDaysAgo, 1),
      )
      if (startedE) totalEvents += 1
      if (completedE) totalEvents += 1
    }

    const batchesForClient = batchesByClient.get(client.id) ?? []
    for (let bi = 0; bi < batchesForClient.length; bi += 1) {
      const batch = batchesForClient[bi]
      if (batch.month) {
        // Batch transitions cluster in the last 2 weeks. Stagger across
        // (clientIdx, batchIdx) so the dashboard feed has a steady stream.
        const daysAgo = Math.max(1, 14 - ((oi + bi) % 14))
        const e = await recordAt(
          {
            clientId: client.id,
            actorId: triggerActor,
            kind: ActivityKind.batch_passed,
            visibility: EventVisibility.internal,
            payload: {
              batchId: batch.id,
              toStep: batch.step,
              month: batch.month,
            },
          },
          ageOf(daysAgo, oi % 12),
        )
        if (e) totalEvents += 1
      }
    }

    if (client.idx === 5) {
      const e = await recordAt(
        {
          clientId: client.id,
          actorId: triggerActor,
          kind: ActivityKind.batch_sent_back,
          visibility: EventVisibility.internal,
          payload: {
            reason:
              'Color tone on hero photos drifted too cool, send back to designer for warmer balance.',
            fromStep: 'am_review_design',
            toStep: 'in_design',
          },
        },
        ageOf(7),
      )
      if (e) totalEvents += 1
    }

    const revisionBatch = batchesForClient.find(
      (b) =>
        b.step === 'design_revisions' || b.step === 'implementing_revisions',
    )
    if (revisionBatch) {
      const dispatched = await recordAt(
        {
          clientId: client.id,
          actorId: triggerActor,
          kind: ActivityKind.batch_revision_dispatched,
          visibility: EventVisibility.internal,
          payload: { batchId: revisionBatch.id, items: 3 },
        },
        ageOf(5),
      )
      const completed = await recordAt(
        {
          clientId: client.id,
          actorId: triggerActor,
          kind: ActivityKind.batch_revision_completed,
          visibility: EventVisibility.internal,
          payload: { batchId: revisionBatch.id },
        },
        ageOf(3),
      )
      if (dispatched) totalEvents += 1
      if (completed) totalEvents += 1
    }

    for (let i = 0; i < 2; i += 1) {
      const isPublic = i % 2 === 0
      // Comments scattered across the last 3 weeks. (oi, i) keys produce
      // distinct timestamps per client per comment so the activity feed
      // reads as an evolving conversation.
      const commentDaysAgo = Math.max(1, 20 - ((oi * 2 + i * 3) % 20))
      const e = await recordAt(
        {
          clientId: client.id,
          actorId: i % 2 === 0 ? triggerActor : org.users.designer1.id,
          kind: ActivityKind.comment,
          visibility: isPublic ? EventVisibility.public : EventVisibility.internal,
          payload: { body: pickComment(client.industryKey, client.idx + i) },
        },
        ageOf(commentDaysAgo, (oi + i) % 18),
      )
      if (e) totalEvents += 1
    }
  }

  const failedE = await recordAt(
    {
      clientId: onboarded[2].id,
      actorId: org.users.admin.id,
      kind: ActivityKind.run_failed,
      visibility: EventVisibility.internal,
      payload: {
        reason:
          'OpenAI rate limit during caption generation; retry succeeded on the next attempt.',
        targetMonth: '2026-01',
      },
    },
    ageOf(35),
  )
  if (failedE) totalEvents += 1

  const memberE = await recordAt(
    {
      clientId: onboarded[0].id,
      actorId: org.users.admin.id,
      kind: ActivityKind.member_role_changed,
      visibility: EventVisibility.admin_only,
      payload: {
        targetUserId: org.users.designer1.id,
        fromRole: 'designer',
        toRole: 'designer',
        note: 'Permission overrides updated.',
      },
    },
    ageOf(11),
  )
  if (memberE) totalEvents += 1

  for (let mi = 0; mi < MENTION_PLANS.length; mi += 1) {
    const plan = MENTION_PLANS[mi]
    if (mentionCursor >= onboarded.length) mentionCursor = 0
    const client = onboarded[mentionCursor % onboarded.length]
    mentionCursor += 1
    const mentionedUser = org.users[plan.mentionUserKey]
    // Mentions span the last 8 days, freshest first so the inbox lands on
    // the most recent unread on top per the inbox spec ordering.
    const mentionWhen = ageOf(Math.max(0.25, 7 - mi * 0.85), mi % 6)
    const event = await db.activityEvent.create({
      data: {
        clientId: client.id,
        actorId: org.users.admin.id,
        kind: ActivityKind.comment,
        visibility:
          plan.mentionUserKey === 'client1'
            ? EventVisibility.public
            : EventVisibility.internal,
        payload: {
          body: plan.body,
          mentions: [mentionedUser.email],
        } as Prisma.InputJsonValue,
        createdAt: mentionWhen,
      },
      select: { id: true },
    })
    await db.mention.create({
      data: {
        activityEventId: event.id,
        mentionedUserId: mentionedUser.id,
        readAt: plan.read ? new Date() : null,
        createdAt: mentionWhen,
      },
    })
    totalEvents += 1
    totalMentions += 1
  }

  // Plant one mention on a batch_passed event for Morgan so the inbox deep
  // link surface is exercisable. Without this, the inbox would only contain
  // comment events whose payloads carry no batchId, and InboxRow's batch
  // deep link branch would never fire in practice. Pick the first onboarded
  // client that has at least one batch.
  const morganBatchClient = onboarded.find((c) => {
    const list = batchesByClient.get(c.id) ?? []
    return list.length > 0 && c.amUserId === org.users.am1.id
  })
  if (morganBatchClient) {
    const batch = (batchesByClient.get(morganBatchClient.id) ?? [])[0]
    if (batch) {
      // Batch deep link mention is the freshest unread for Morgan so it
      // surfaces at the top of the inbox.
      const morganBatchWhen = ageOf(0.5)
      const batchEvent = await db.activityEvent.create({
        data: {
          clientId: morganBatchClient.id,
          actorId: org.users.admin.id,
          kind: ActivityKind.batch_passed,
          visibility: EventVisibility.internal,
          payload: {
            batchId: batch.id,
            toStep: batch.step,
            month: batch.month,
            mentions: [org.users.am1.email],
          } as Prisma.InputJsonValue,
          createdAt: morganBatchWhen,
        },
        select: { id: true },
      })
      await db.mention.create({
        data: {
          activityEventId: batchEvent.id,
          mentionedUserId: org.users.am1.id,
          readAt: null,
          createdAt: morganBatchWhen,
        },
      })
      totalEvents += 1
      totalMentions += 1
    }
  }

  return { totalEvents, totalMentions }
}

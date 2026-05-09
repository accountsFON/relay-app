/**
 * Demo seed: ~10 to 15 ActivityEvents per onboarded client covering every
 * kind referenced in the plan. Plus 9 Mentions distributed per the inbox
 * spec (4 unread Morgan, 2 unread Sam, 2 read Riley, 1 to Casey).
 *
 * Strategy: wipe demo activity rows first, then re emit. The demo activity
 * is fully derived from the seeded clients / runs / batches so a clean
 * rebuild is the simplest path to determinism.
 */
import type { PrismaClient } from '@prisma/client'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { recordActivity } from '@/server/services/activity'
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
    body: '@morgan.reyes client asked about adding a holiday hours post — pinging you for sign off.',
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

export async function seedActivity(
  db: PrismaClient,
  clients: SeededClient[],
  runs: SeededContentRun[],
  batches: SeededBatch[],
  org: SeededUserMap,
): Promise<SeedActivityResult> {
  const clientIds = clients.map((c) => c.id)
  await db.activityEvent.deleteMany({ where: { clientId: { in: clientIds } } })

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

  for (const client of clients) {
    const triggerActor = client.amUserId ?? org.users.admin.id

    await recordActivity({
      clientId: client.id,
      actorId: org.users.admin.id,
      kind: ActivityKind.client_created,
      visibility: EventVisibility.internal,
      payload: { name: client.name },
    })
    totalEvents += 1

    if (client.amUserId) {
      await recordActivity({
        clientId: client.id,
        actorId: org.users.admin.id,
        kind: ActivityKind.client_am_assigned,
        visibility: EventVisibility.internal,
        payload: { userId: client.amUserId },
      })
      totalEvents += 1
    }
    if (client.designerUserId) {
      await recordActivity({
        clientId: client.id,
        actorId: org.users.admin.id,
        kind: ActivityKind.client_designer_assigned,
        visibility: EventVisibility.internal,
        payload: { userId: client.designerUserId },
      })
      totalEvents += 1
    }

    if (client.onboarded) {
      await recordActivity({
        clientId: client.id,
        actorId: triggerActor,
        kind: ActivityKind.client_profile_edited,
        visibility: EventVisibility.internal,
        payload: {
          fieldsChanged: ['businessSummary', 'brandVoice', 'mainCta'],
        },
      })
      totalEvents += 1
    }
  }

  for (const client of onboarded) {
    const triggerActor = client.amUserId ?? org.users.admin.id
    const runsForClient = runsByClient.get(client.id) ?? []

    for (const run of runsForClient) {
      await recordActivity({
        clientId: client.id,
        runId: run.id,
        actorId: triggerActor,
        kind: ActivityKind.run_started,
        visibility: EventVisibility.internal,
        payload: { targetMonth: run.targetMonth },
      })
      await recordActivity({
        clientId: client.id,
        runId: run.id,
        actorId: triggerActor,
        kind: ActivityKind.run_completed,
        visibility: EventVisibility.public,
        payload: { targetMonth: run.targetMonth, posts: run.postIds.length },
      })
      totalEvents += 2
    }

    const batchesForClient = batchesByClient.get(client.id) ?? []
    for (const batch of batchesForClient) {
      if (batch.month) {
        await recordActivity({
          clientId: client.id,
          actorId: triggerActor,
          kind: ActivityKind.batch_passed,
          visibility: EventVisibility.internal,
          payload: {
            batchId: batch.id,
            toStep: batch.step,
            month: batch.month,
          },
        })
        totalEvents += 1
      }
    }

    if (client.idx === 5) {
      await recordActivity({
        clientId: client.id,
        actorId: triggerActor,
        kind: ActivityKind.batch_sent_back,
        visibility: EventVisibility.internal,
        payload: {
          reason: 'Color tone on hero photos drifted too cool, send back to designer for warmer balance.',
          fromStep: 'am_review_design',
          toStep: 'in_design',
        },
      })
      totalEvents += 1
    }

    const revisionBatch = batchesForClient.find(
      (b) =>
        b.step === 'design_revisions' || b.step === 'implementing_revisions',
    )
    if (revisionBatch) {
      await recordActivity({
        clientId: client.id,
        actorId: triggerActor,
        kind: ActivityKind.batch_revision_dispatched,
        visibility: EventVisibility.internal,
        payload: { batchId: revisionBatch.id, items: 3 },
      })
      await recordActivity({
        clientId: client.id,
        actorId: triggerActor,
        kind: ActivityKind.batch_revision_completed,
        visibility: EventVisibility.internal,
        payload: { batchId: revisionBatch.id },
      })
      totalEvents += 2
    }

    for (let i = 0; i < 2; i += 1) {
      const isPublic = i % 2 === 0
      await recordActivity({
        clientId: client.id,
        actorId: i % 2 === 0 ? triggerActor : org.users.designer1.id,
        kind: ActivityKind.comment,
        visibility: isPublic ? EventVisibility.public : EventVisibility.internal,
        payload: { body: pickComment(client.industryKey, client.idx + i) },
      })
      totalEvents += 1
    }
  }

  await recordActivity({
    clientId: onboarded[2].id,
    actorId: org.users.admin.id,
    kind: ActivityKind.run_failed,
    visibility: EventVisibility.internal,
    payload: {
      reason: 'OpenAI rate limit during caption generation; retry succeeded on the next attempt.',
      targetMonth: '2026-01',
    },
  })
  totalEvents += 1

  await recordActivity({
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
  })
  totalEvents += 1

  for (const plan of MENTION_PLANS) {
    if (mentionCursor >= onboarded.length) mentionCursor = 0
    const client = onboarded[mentionCursor % onboarded.length]
    mentionCursor += 1
    const mentionedUser = org.users[plan.mentionUserKey]
    const event = await db.activityEvent.create({
      data: {
        clientId: client.id,
        actorId: org.users.admin.id,
        kind: ActivityKind.comment,
        visibility:
          plan.mentionUserKey === 'client1'
            ? EventVisibility.public
            : EventVisibility.internal,
        payload: { body: plan.body, mentions: [mentionedUser.email] },
      },
      select: { id: true },
    })
    await db.mention.create({
      data: {
        activityEventId: event.id,
        mentionedUserId: mentionedUser.id,
        readAt: plan.read ? new Date() : null,
      },
    })
    totalEvents += 1
    totalMentions += 1
  }

  return { totalEvents, totalMentions }
}

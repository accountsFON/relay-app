/**
 * Demo seed: 3 ContentRuns per onboarded client across the last 4 months
 * (2026-02, 2026-03, 2026-04). Every run is `complete` with 10 Posts,
 * 4 hashtags per post, and deterministic captions sourced from the
 * industry caption pool.
 *
 * Stable on (clientId, targetMonth) so reruns do not churn diffs.
 */
import type { PrismaClient } from '@prisma/client'
import { RunStatus } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SeededClient } from './clients'
import type { SeededUserMap } from './users'

interface CaptionMap {
  [industry: string]: string[]
}
interface HashtagMap {
  [industry: string]: string[]
}

function loadJson<T>(file: string): T {
  const p = path.join(__dirname, 'data', file)
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

const CAPTIONS = loadJson<CaptionMap>('captions.json')
const HASHTAGS = loadJson<HashtagMap>('hashtags.json')

export const TARGET_MONTHS = ['2026-02', '2026-03', '2026-04'] as const
export type TargetMonth = (typeof TARGET_MONTHS)[number]

const POSTS_PER_RUN = 10
const HASHTAGS_PER_POST = 4

export interface SeededContentRun {
  id: string
  clientId: string
  clientIdx: number
  targetMonth: TargetMonth
  postIds: string[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parsePostingDays(spec: string): Set<number> {
  const set = new Set<number>()
  for (const token of spec.split(',').map((s) => s.trim())) {
    const idx = DAY_NAMES.indexOf(token)
    if (idx >= 0) set.add(idx)
  }
  if (set.size === 0) {
    set.add(1)
    set.add(3)
    set.add(5)
  }
  return set
}

/**
 * Generate exactly `count` post dates within the target month using the
 * client's posting days. If posting days alone do not yield enough dates,
 * fall back to filling sequential days. Deterministic per (month, days).
 */
function buildPostDates(
  targetMonth: TargetMonth,
  postingDays: string,
  count: number,
): Date[] {
  const [yearStr, monthStr] = targetMonth.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1
  const dayWindow = parsePostingDays(postingDays)

  const dates: Date[] = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (let d = 1; d <= daysInMonth && dates.length < count; d += 1) {
    const candidate = new Date(Date.UTC(year, month, d, 12, 0, 0))
    if (dayWindow.has(candidate.getUTCDay())) {
      dates.push(candidate)
    }
  }

  for (let d = 1; d <= daysInMonth && dates.length < count; d += 1) {
    const candidate = new Date(Date.UTC(year, month, d, 12, 0, 0))
    if (!dates.some((existing) => existing.getUTCDate() === d)) {
      dates.push(candidate)
    }
  }

  return dates.slice(0, count).sort((a, b) => a.getTime() - b.getTime())
}

function pickCaption(industryKey: string, postIdx: number, monthIdx: number): string {
  const pool = CAPTIONS[industryKey] ?? CAPTIONS.dental
  const offset = (postIdx + monthIdx * 3) % pool.length
  return pool[offset]
}

function pickHashtags(industryKey: string, postIdx: number, monthIdx: number): string[] {
  const pool = HASHTAGS[industryKey] ?? HASHTAGS.dental
  const result: string[] = []
  for (let i = 0; i < HASHTAGS_PER_POST; i += 1) {
    const offset = (postIdx * 5 + i + monthIdx * 7) % pool.length
    result.push(pool[offset])
  }
  return result
}

function monthIdx(targetMonth: TargetMonth): number {
  return TARGET_MONTHS.indexOf(targetMonth)
}

function pickGraphicHook(industryKey: string, postIdx: number): string {
  const hooks: Record<string, string> = {
    dental: 'Smile photo + bold tagline overlay',
    plumbing: 'Action shot of plumber on a job',
    fitness: 'Member training mid rep',
    real_estate: 'Hero exterior or interior shot',
    auto: 'Vehicle on a lift, clean shop background',
    legal: 'Office portrait or skyline backdrop',
    accounting: 'Clean numbers graphic with brand color',
    landscaping: 'Before / after landscape pairing',
    restaurant: 'Plated dish, top down',
    veterinary: 'Patient with their human',
    contracting: 'Job site progress',
    photography: 'Behind the scenes setup',
    hvac: 'Tech installing equipment',
    education: 'Student aha moment',
    beauty: 'Stylist mid service',
    beverage: 'Tap pour or coffee bloom',
    health: 'Calm clinic environment',
    retail: 'Lifestyle product shot',
  }
  const base = hooks[industryKey] ?? 'Hero brand photo'
  return `${base} (variation ${(postIdx % 3) + 1})`
}

export async function seedContentRuns(
  db: PrismaClient,
  clients: SeededClient[],
  org: SeededUserMap,
): Promise<SeededContentRun[]> {
  const onboarded = clients.filter((c) => c.onboarded)
  const result: SeededContentRun[] = []

  for (const client of onboarded) {
    const triggeredById =
      client.amUserId ?? org.users.admin.id

    for (const targetMonth of TARGET_MONTHS) {
      const monthIndex = monthIdx(targetMonth)
      const startedAt = new Date(`${targetMonth}-05T08:00:00Z`)
      const completedAt = new Date(`${targetMonth}-05T08:30:00Z`)

      const existingRun = await db.contentRun.findFirst({
        where: { clientId: client.id, targetMonth },
        select: { id: true },
      })

      const runData = {
        clientId: client.id,
        triggeredById,
        targetMonth,
        status: RunStatus.complete,
        brief: `Monthly content brief for ${client.name} (${targetMonth}).`,
        supportingFacts: `Facts pulled from crawl + intake for ${client.name}.`,
        crawledContent: null,
        postingDates: [] as string[],
        openaiCostUsd: 0.42,
        anthropicCostUsd: 0.18,
        apifyCostUsd: 0,
        totalCostUsd: 0.6,
        creditsConsumed: 1,
        startedAt,
        completedAt,
      }

      let runId: string
      if (existingRun) {
        await db.contentRun.update({
          where: { id: existingRun.id },
          data: runData,
        })
        runId = existingRun.id
        await db.post.deleteMany({ where: { contentRunId: runId } })
      } else {
        const created = await db.contentRun.create({
          data: runData,
          select: { id: true },
        })
        runId = created.id
      }

      const postDates = buildPostDates(targetMonth, client.postingDays, POSTS_PER_RUN)
      const postIds: string[] = []

      for (let i = 0; i < postDates.length; i += 1) {
        const postDate = postDates[i]
        const caption = pickCaption(client.industryKey, i, monthIndex)
        const tags = pickHashtags(client.industryKey, i, monthIndex)
        const hook = pickGraphicHook(client.industryKey, i)
        const created = await db.post.create({
          data: {
            contentRunId: runId,
            clientId: client.id,
            postDate,
            caption,
            hashtags: tags,
            graphicHook: hook,
            designerNotes: null,
            mediaUrls: [],
          },
          select: { id: true },
        })
        postIds.push(created.id)
      }

      await db.contentRun.update({
        where: { id: runId },
        data: { postingDates: postDates.map((d) => d.toISOString().slice(0, 10)) },
      })

      result.push({
        id: runId,
        clientId: client.id,
        clientIdx: client.idx,
        targetMonth,
        postIds,
      })
    }
  }

  return result
}

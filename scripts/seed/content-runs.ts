/**
 * Demo seed: 3 ContentRuns per onboarded client across the last 4 months
 * (2026-02, 2026-03, 2026-04). Every run is `complete` with 10 Posts each.
 *
 * Posts mirror the captionPrompt output shape so the demo reads like real
 * Bekah AI output. Source data lives in `data/post-templates.json` keyed
 * by industry. Each template carries:
 *   - caption: 2 to 5 paragraph body, no CTA
 *   - hashtags: 3 to 8 entries, # prefixed
 *   - graphicHook: 3 to 8 word visual hook
 *   - designerNotes: 1 sentence broad direction
 *
 * The seed appends `client.mainCta` to the caption body to match the
 * postParser behavior in production. The result is a publish ready post
 * exactly the way the live pipeline persists them.
 *
 * Stable on (clientId, targetMonth) so reruns do not churn diffs.
 */
import type { DbClient } from '@/db/client'
import { RunStatus } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SeededClient } from './clients'
import type { SeededUserMap } from './users'

interface PostTemplate {
  caption: string
  hashtags: string[]
  graphicHook: string
  designerNotes: string
}

interface PostTemplatesFile {
  [industry: string]: PostTemplate[]
}

function loadJson<T>(file: string): T {
  const p = path.join(__dirname, 'data', file)
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

const TEMPLATES_RAW = loadJson<PostTemplatesFile>('post-templates.json')
// Drop the leading `_comment` key from the raw JSON so industry lookups
// stay clean.
const TEMPLATES: PostTemplatesFile = Object.fromEntries(
  Object.entries(TEMPLATES_RAW).filter(([k]) => !k.startsWith('_')),
)

export const TARGET_MONTHS = ['2026-02', '2026-03', '2026-04'] as const
export type TargetMonth = (typeof TARGET_MONTHS)[number]

const POSTS_PER_RUN = 10

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

function templatesFor(industryKey: string): PostTemplate[] {
  return TEMPLATES[industryKey] ?? TEMPLATES.dental
}

function pickTemplate(
  industryKey: string,
  postIdx: number,
  monthIdx: number,
): PostTemplate {
  const pool = templatesFor(industryKey)
  // Stagger by post index plus a month offset so successive months read as
  // different content even when the pool repeats.
  const offset = (postIdx + monthIdx * 3) % pool.length
  return pool[offset]
}

/**
 * Append the client's main CTA to a caption body, matching the postParser
 * behavior in production. The CTA is added after a blank line so it visually
 * separates from the body in the post detail card.
 */
function appendCta(captionBody: string, mainCta: string | null | undefined): string {
  const trimmed = captionBody.trimEnd()
  const cta = (mainCta ?? '').trim()
  if (!cta) return trimmed
  return `${trimmed}\n\n${cta}`
}

function monthIdx(targetMonth: TargetMonth): number {
  return TARGET_MONTHS.indexOf(targetMonth)
}

export async function seedContentRuns(
  db: DbClient,
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

      const createData = {
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
        crawlerCostUsd: 0,
        totalCostUsd: 0.6,
        creditsConsumed: 1,
        startedAt,
        completedAt,
        tokenUsage: {
          pipelineDurationSeconds: 1830,
          breakdown: {
            openai: {
              brief: { inputTokens: 4200, outputTokens: 820, usd: 0.21 },
              facts: { inputTokens: 3100, outputTokens: 610, usd: 0.18 },
              total: 0.39,
            },
            anthropic: {
              captions: { inputTokens: 8500, outputTokens: 2100, usd: 0.21 },
              total: 0.21,
            },
            crawl: { credits: 50, urlsCrawled: 12, usd: 0.05 },
            infra: { triggerDev: 0.02, vercel: 0.01, neon: 0.01, total: 0.04 },
            subtotal: 0.69,
            infraBuffer: 0.03,
            total: 0.72,
            credits: 1,
          },
        },
      }
      // Update payload omits FK relation fields. Prisma 7 requires the
      // `client: { connect: { id } }` form for relations in update(), and
      // these never change for an existing run anyway.
      const { clientId: _c, triggeredById: _t, ...updateData } = createData
      void _c
      void _t

      let runId: string
      if (existingRun) {
        await db.contentRun.update({
          where: { id: existingRun.id },
          data: updateData,
        })
        runId = existingRun.id
        await db.post.deleteMany({ where: { contentRunId: runId } })
      } else {
        const created = await db.contentRun.create({
          data: createData,
          select: { id: true },
        })
        runId = created.id
      }

      const postDates = buildPostDates(targetMonth, client.postingDays, POSTS_PER_RUN)
      const postIds: string[] = []

      for (let i = 0; i < postDates.length; i += 1) {
        const postDate = postDates[i]
        const tpl = pickTemplate(client.industryKey, i, monthIndex)
        const caption = appendCta(tpl.caption, client.mainCta)
        const created = await db.post.create({
          data: {
            contentRunId: runId,
            clientId: client.id,
            postDate,
            caption,
            hashtags: tpl.hashtags,
            graphicHook: tpl.graphicHook,
            designerNotes: tpl.designerNotes,
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

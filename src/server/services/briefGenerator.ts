import OpenAI from 'openai'
import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost, type CostResult } from '@/server/services/costTracker'
import { buildBriefPrompt } from '@/server/prompts/briefPrompt'
import type { PostingDate } from '@/server/services/dateCalculator'

const openai = new OpenAI()

const EXPECTED_SECTIONS = [
  'Elevator Summary',
  'Brand Voice',
  'Focuses for this month',
]

type BriefClient = {
  name: string
  businessSummary?: string | null
  brandVoice?: string | null
  phone?: string | null
  mainCta?: string | null
  focus1?: string | null
  focus2?: string | null
  focus3?: string | null
  dos?: string | null
  donts?: string | null
  urls: string[]
  targetAudience?: string | null
}

export type BriefResult = {
  brief: string
  cost: CostResult
}

export async function generateBrief(
  client: BriefClient,
  postingDates: PostingDate[],
  holidays: string[],
  holidayTags: string[]
): Promise<BriefResult> {
  const config = AI_MODELS.brief
  const { system, user } = buildBriefPrompt(client, postingDates, holidays, holidayTags)

  const response = await openai.chat.completions.create({
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const brief = response.choices[0]?.message?.content
  if (!brief || brief.trim().length === 0) {
    throw new Error('Brief generation returned empty response')
  }

  const missingSections = EXPECTED_SECTIONS.filter(
    (section) => !brief.includes(section)
  )
  if (missingSections.length > EXPECTED_SECTIONS.length / 2) {
    throw new Error(
      `Brief is missing key sections: ${missingSections.join(', ')}`
    )
  }

  const usage = response.usage
  const cost = calculateCost(config.model, {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  })

  return { brief, cost }
}

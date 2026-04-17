import OpenAI from 'openai'
import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost, type CostResult } from '@/server/services/costTracker'
import { buildFactsPrompt } from '@/server/prompts/factsPrompt'

const openai = new OpenAI()

const EXPECTED_SECTIONS = ['What we do']

export type FactsResult = {
  facts: string
  cost: CostResult
}

export async function extractFacts(crawledContent: string): Promise<FactsResult> {
  if (!crawledContent || crawledContent.trim().length < 100) {
    return {
      facts: 'No website content available. Use client brief for caption writing.',
      cost: { inputTokens: 0, outputTokens: 0, usd: 0 },
    }
  }

  const config = AI_MODELS.facts
  const { system, user } = buildFactsPrompt(crawledContent)

  const response = await openai.chat.completions.create({
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const facts = response.choices[0]?.message?.content
  if (!facts || facts.trim().length === 0) {
    throw new Error('Facts extraction returned empty response')
  }

  const missingSections = EXPECTED_SECTIONS.filter(
    (section) => !facts.toLowerCase().includes(section.toLowerCase())
  )
  if (missingSections.length === EXPECTED_SECTIONS.length) {
    throw new Error(
      `Facts response missing all expected sections: ${missingSections.join(', ')}`
    )
  }

  const usage = response.usage
  const cost = calculateCost(config.model, {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  })

  return { facts, cost }
}

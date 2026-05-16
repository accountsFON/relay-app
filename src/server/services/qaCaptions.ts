import OpenAI from 'openai'
import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost, type CostResult } from '@/server/services/costTracker'
import { buildQaPrompt, QA_RESPONSE_SCHEMA, type QaRules } from '@/server/prompts/qaPrompt'
import type { ParsedPost } from '@/server/services/captionGenerator'

export type QaResult = {
  posts: ParsedPost[]
  cost: CostResult
}

const ZERO_COST: CostResult = { inputTokens: 0, outputTokens: 0, usd: 0 }

function hasAnyRules(rules: QaRules): boolean {
  return Boolean(
    rules.dos?.trim() ||
    rules.donts?.trim() ||
    rules.brandVoice?.trim()
  )
}

export async function qaCaptions(
  posts: ParsedPost[],
  rules: QaRules
): Promise<QaResult> {
  if (!hasAnyRules(rules)) {
    return { posts, cost: ZERO_COST }
  }

  // OpenAI call comes in next task
  return { posts, cost: ZERO_COST }
}

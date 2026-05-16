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

  const config = AI_MODELS.qa
  const openai = new OpenAI()

  const captionsInput = posts.map((p) => ({
    postNumber: p.postNumber,
    caption: p.caption,
  }))

  const { system, user } = buildQaPrompt(rules, captionsInput)

  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'qa_corrections',
          schema: QA_RESPONSE_SCHEMA,
          strict: true,
        },
      },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('[qaCaptions] empty response from QA model')
      return { posts, cost: ZERO_COST }
    }

    const parsed = JSON.parse(content) as {
      corrections: Array<{ postNumber: number; correctedCaption: string }>
    }

    const correctionsByPostNumber = new Map(
      parsed.corrections.map((c) => [c.postNumber, c.correctedCaption])
    )

    const mergedPosts: ParsedPost[] = posts.map((post) => {
      const corrected = correctionsByPostNumber.get(post.postNumber)
      if (corrected === undefined) return post
      if (corrected === post.caption) return post // byte-equal, no-op
      return {
        ...post,
        caption: corrected,
        originalCaption: post.caption,
      }
    })

    for (const c of parsed.corrections) {
      if (!posts.some((p) => p.postNumber === c.postNumber)) {
        console.warn(
          `[qaCaptions] QA returned correction for unknown postNumber=${c.postNumber}; ignored`
        )
      }
    }

    const cost = calculateCost(config.model, {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    })

    return { posts: mergedPosts, cost }
  } catch (err) {
    console.error('[qaCaptions] QA call failed, falling back to original captions', err)
    return { posts, cost: ZERO_COST }
  }
}

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost, type CostResult } from '@/server/services/costTracker'
import { buildCaptionPrompt } from '@/server/prompts/captionPrompt'
import type { PostingDate } from '@/server/services/dateCalculator'

export type ParsedPost = {
  postNumber: number
  date: string
  caption: string
  cta: string
  hashtags: string[]
  graphicHook: string
  designerNotes: string
}

export type CaptionResult = {
  posts: ParsedPost[]
  cost: CostResult
}

type CaptionClient = {
  mainCta?: string | null
  postLength?: string | null
}

export async function generateCaptions(
  brief: string,
  facts: string,
  postingDates: PostingDate[],
  client: CaptionClient
): Promise<CaptionResult> {
  const config = AI_MODELS.captions
  const anthropic = new Anthropic()
  const { user, assistantPrefill } = buildCaptionPrompt(brief, facts, postingDates, client)

  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: assistantPrefill },
    ],
  })

  const response = await stream.finalMessage()

  const textBlock = response.content.find((b) => b.type === 'text')
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : ''

  let posts = tryParsePostsJSON(assistantPrefill + rawText)

  if (!posts) {
    posts = tryParsePostsJSON(rawText)
  }

  if (!posts) {
    const retryStream = anthropic.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: assistantPrefill },
        {
          role: 'user',
          content:
            'Your previous response was not valid JSON. Please respond ONLY with the JSON object containing the "posts" array. No other text.',
        },
      ],
    })

    const retryResponse = await retryStream.finalMessage()
    const retryBlock = retryResponse.content.find((b) => b.type === 'text')
    const retryText = retryBlock && 'text' in retryBlock ? retryBlock.text : ''
    posts = tryParsePostsJSON(retryText)

    if (!posts) {
      throw new Error('Caption generation failed to produce valid JSON after retry')
    }

    const retryUsage = retryResponse.usage
    const retryCost = calculateCost(config.model, {
      inputTokens: retryUsage.input_tokens,
      outputTokens: retryUsage.output_tokens,
    })

    const firstUsage = response.usage
    const firstCost = calculateCost(config.model, {
      inputTokens: firstUsage.input_tokens,
      outputTokens: firstUsage.output_tokens,
    })

    return {
      posts,
      cost: {
        inputTokens: firstCost.inputTokens + retryCost.inputTokens,
        outputTokens: firstCost.outputTokens + retryCost.outputTokens,
        usd: Math.round((firstCost.usd + retryCost.usd) * 10000) / 10000,
      },
    }
  }

  if (posts.length !== postingDates.length) {
    console.warn(
      `Caption count mismatch: got ${posts.length}, expected ${postingDates.length}`
    )
  }

  const usage = response.usage
  const cost = calculateCost(config.model, {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  })

  return { posts, cost }
}

function tryParsePostsJSON(text: string): ParsedPost[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"posts"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.posts)) return null
    if (parsed.posts.length === 0) return null

    return parsed.posts.map((p: Record<string, unknown>, i: number) => ({
      postNumber: typeof p.postNumber === 'number' ? p.postNumber : i + 1,
      date: String(p.date ?? ''),
      caption: String(p.caption ?? ''),
      cta: String(p.cta ?? ''),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      graphicHook: String(p.graphicHook ?? ''),
      designerNotes: String(p.designerNotes ?? ''),
    }))
  } catch {
    return null
  }
}

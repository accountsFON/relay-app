import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/server/config/aiModels'
import { calculateCost, type CostResult } from '@/server/services/costTracker'
import { buildCaptionPrompt } from '@/server/prompts/captionPrompt'
import type { PostingDate } from '@/server/services/dateCalculator'
import type { CtaCandidate } from '@/server/services/postParser'
import { qaCaptions } from '@/server/services/qaCaptions'

export type ParsedPost = {
  postNumber: number
  date: string
  caption: string
  originalCaption?: string  // Set only when QA modified the caption
  ctaIndex?: number
  hashtags: string[]
  graphicHook: string
  designerNotes: string
}

export type CaptionResult = {
  posts: ParsedPost[]
  cost: CostResult
}

type CaptionClient = {
  postLength?: string | null
  dos?: string | null
  donts?: string | null
  brandVoice?: string | null
}

export async function generateCaptions(
  brief: string,
  facts: string,
  postingDates: PostingDate[],
  client: CaptionClient,
  ctaCandidates: CtaCandidate[]
): Promise<CaptionResult> {
  const config = AI_MODELS.captions
  const anthropic = new Anthropic()
  const { user, assistantPrefill } = buildCaptionPrompt(
    brief,
    facts,
    postingDates,
    client,
    ctaCandidates
  )

  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: assistantPrefill,
    messages: [
      { role: 'user', content: user },
    ],
  })

  const response = await stream.finalMessage()

  const textBlock = response.content.find((b) => b.type === 'text')
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : ''

  let posts = tryParsePostsJSON(rawText)

  if (!posts) {
    const retryStream = anthropic.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      system: assistantPrefill,
      messages: [
        { role: 'user', content: user },
        {
          role: 'assistant',
          content: 'I understand. Let me try again.',
        },
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

    const retryCombinedCost: CostResult = {
      inputTokens: firstCost.inputTokens + retryCost.inputTokens,
      outputTokens: firstCost.outputTokens + retryCost.outputTokens,
      usd: Math.round((firstCost.usd + retryCost.usd) * 10000) / 10000,
    }

    // QA pass: silently auto-correct captions against client rules.
    // No-op if no rules are configured. Failures fall through to
    // original captions; the pipeline never fails due to QA.
    const retryQaResult = await qaCaptions(posts, {
      dos: client.dos,
      donts: client.donts,
      brandVoice: client.brandVoice,
    })

    return {
      posts: retryQaResult.posts,
      cost: {
        inputTokens: retryCombinedCost.inputTokens + retryQaResult.cost.inputTokens,
        outputTokens: retryCombinedCost.outputTokens + retryQaResult.cost.outputTokens,
        usd: retryCombinedCost.usd + retryQaResult.cost.usd,
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

  // QA pass: silently auto-correct captions against client rules.
  // No-op if no rules are configured. Failures fall through to
  // original captions; the pipeline never fails due to QA.
  const qaResult = await qaCaptions(posts, {
    dos: client.dos,
    donts: client.donts,
    brandVoice: client.brandVoice,
  })

  const totalCost: CostResult = {
    inputTokens: cost.inputTokens + qaResult.cost.inputTokens,
    outputTokens: cost.outputTokens + qaResult.cost.outputTokens,
    usd: cost.usd + qaResult.cost.usd,
  }

  return { posts: qaResult.posts, cost: totalCost }
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
      ctaIndex: typeof p.ctaIndex === 'number' ? p.ctaIndex : undefined,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      graphicHook: String(p.graphicHook ?? ''),
      designerNotes: String(p.designerNotes ?? ''),
    }))
  } catch {
    return null
  }
}

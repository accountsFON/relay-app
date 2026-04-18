import { TOKEN_PRICING, INFRA_COST_ESTIMATES } from '@/server/config/aiModels'

export type TokenUsageEntry = {
  inputTokens: number
  outputTokens: number
}

export type CostResult = {
  inputTokens: number
  outputTokens: number
  usd: number
}

export type RunCostBreakdown = {
  openai: {
    brief: CostResult
    facts: CostResult
    total: number
  }
  anthropic: {
    captions: CostResult
    total: number
  }
  apify: {
    computeUnits: number
    urlsCrawled: number
    usd: number
  }
  infra: {
    triggerDev: number
    vercel: number
    neon: number
    total: number
  }
  subtotal: number
  infraBuffer: number
  total: number
  credits: number
}

export function calculateCost(model: string, usage: TokenUsageEntry): CostResult {
  const pricing = TOKEN_PRICING[model]
  if (!pricing) {
    throw new Error(`Unknown model for pricing: ${model}`)
  }

  const usd = usage.inputTokens * pricing.input + usage.outputTokens * pricing.output

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    usd: round4(usd),
  }
}

export function buildCostBreakdown(params: {
  briefCost: CostResult
  factsCost: CostResult
  captionsCost: CostResult
  apifyCost: { computeUnits: number; usd: number; urlsCrawled: number }
  pipelineDurationSeconds: number
}): RunCostBreakdown {
  const { briefCost, factsCost, captionsCost, apifyCost, pipelineDurationSeconds } = params

  const openaiTotal = round4(briefCost.usd + factsCost.usd)
  const anthropicTotal = round4(captionsCost.usd)

  const triggerDevCost = round4(pipelineDurationSeconds * INFRA_COST_ESTIMATES.triggerDevPerSecond)
  const vercelCost = round4(INFRA_COST_ESTIMATES.vercelPerInvocation * 3)
  const neonCost = round4(
    (INFRA_COST_ESTIMATES.estimatedDbSecondsPerRun / 3600) *
      INFRA_COST_ESTIMATES.neonPerComputeHour
  )
  const infraTotal = round4(triggerDevCost + vercelCost + neonCost)

  const subtotal = round4(openaiTotal + anthropicTotal + apifyCost.usd + infraTotal)
  const infraBuffer = round4(subtotal * (INFRA_COST_ESTIMATES.infraBufferMultiplier - 1))
  const total = round4(subtotal + infraBuffer)

  return {
    openai: {
      brief: briefCost,
      facts: factsCost,
      total: openaiTotal,
    },
    anthropic: {
      captions: captionsCost,
      total: anthropicTotal,
    },
    apify: {
      computeUnits: apifyCost.computeUnits,
      urlsCrawled: apifyCost.urlsCrawled,
      usd: apifyCost.usd,
    },
    infra: {
      triggerDev: triggerDevCost,
      vercel: vercelCost,
      neon: neonCost,
      total: infraTotal,
    },
    subtotal,
    infraBuffer,
    total,
    credits: costToCredits(total),
  }
}

export function sumCosts(...costs: (number | null | undefined)[]): number {
  return round4(costs.reduce<number>((sum, c) => sum + (c ?? 0), 0))
}

export function costToCredits(totalCostUsd: number): number {
  return Math.ceil(totalCostUsd * 100)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

import { TOKEN_PRICING } from '@/server/config/aiModels'

export type TokenUsageEntry = {
  inputTokens: number
  outputTokens: number
}

export type CostResult = {
  inputTokens: number
  outputTokens: number
  usd: number
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
    usd: Math.round(usd * 10000) / 10000,
  }
}

export function sumCosts(...costs: (number | null | undefined)[]): number {
  return Math.round(
    costs.reduce<number>((sum, c) => sum + (c ?? 0), 0) * 10000
  ) / 10000
}

export function costToCredits(totalCostUsd: number): number {
  return Math.ceil(totalCostUsd * 100)
}

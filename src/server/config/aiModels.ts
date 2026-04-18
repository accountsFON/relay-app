export const AI_MODELS = {
  brief: {
    provider: 'openai' as const,
    model: 'gpt-4.1',
    temperature: 0.4,
    maxTokens: 1200,
  },
  facts: {
    provider: 'openai' as const,
    model: 'gpt-4.1',
    temperature: 0.2,
    maxTokens: 2048,
  },
  captions: {
    provider: 'anthropic' as const,
    model: 'claude-opus-4-7',
    temperature: 0.5,
    maxTokens: 32000,
  },
} as const

export const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2.0 / 1_000_000, output: 8.0 / 1_000_000 },
  'claude-opus-4-7': { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  'claude-sonnet-4-6': { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
}

export const CRAWL_CONFIG = {
  maxUrls: 10,
  scrapeTimeoutMs: 30000,
  costPerCredit: 0.0053,
}

export const INFRA_COST_ESTIMATES = {
  triggerDevPerSecond: 0.001,
  vercelPerInvocation: 0.0000006,
  neonPerComputeHour: 0.16,
  estimatedDbSecondsPerRun: 2,
  infraBufferMultiplier: 1.05,
}

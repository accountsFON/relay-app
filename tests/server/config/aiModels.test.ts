import { describe, it, expect } from 'vitest'
import { AI_MODELS, TOKEN_PRICING } from '@/server/config/aiModels'

describe('AI_MODELS.qa', () => {
  it('uses OpenAI gpt-5 at temperature 0.1', () => {
    expect(AI_MODELS.qa).toEqual({
      provider: 'openai',
      model: 'gpt-5',
      temperature: 0.1,
    })
  })
})

describe('TOKEN_PRICING.gpt-5', () => {
  it('has correct per-token pricing for gpt-5', () => {
    expect(TOKEN_PRICING['gpt-5']).toEqual({
      input: 1.25 / 1_000_000,
      output: 10.0 / 1_000_000,
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mock for OpenAI SDK - must be defined before importing the service
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}))

import { qaCaptions } from '@/server/services/qaCaptions'

describe('qaCaptions', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('skips QA when all three rule fields are empty', async () => {
    const captions = [
      {
        postNumber: 1,
        date: '2026-05-01',
        caption: 'hi',
        hashtags: [],
        graphicHook: '',
        designerNotes: '',
      },
    ]
    const result = await qaCaptions(captions, {
      dos: null,
      donts: '',
      brandVoice: '   ', // whitespace counts as empty
    })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.posts).toEqual(captions)
    expect(result.cost).toEqual({ inputTokens: 0, outputTokens: 0, usd: 0 })
  })
})

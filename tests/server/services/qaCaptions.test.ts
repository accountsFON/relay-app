import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mock for OpenAI SDK - vi.hoisted ensures mockCreate is defined
// before vi.mock factory runs (vi.mock calls are hoisted by Vitest)
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => {
  const OpenAIMock = vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }
  })
  return { default: OpenAIMock }
})

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

  it('returns posts unchanged when QA returns empty corrections array', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ corrections: [] }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    })

    const captions = [
      {
        postNumber: 1,
        date: '2026-05-01',
        caption: 'all good',
        hashtags: [],
        graphicHook: '',
        designerNotes: '',
      },
    ]
    const result = await qaCaptions(captions, {
      dos: 'be friendly',
      donts: null,
      brandVoice: null,
    })

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(result.posts).toEqual(captions)
    expect(result.posts[0].originalCaption).toBeUndefined()
    expect(result.cost.inputTokens).toBe(100)
    expect(result.cost.outputTokens).toBe(10)
  })

  it('replaces caption and preserves original when QA returns a correction', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              corrections: [{ postNumber: 1, correctedCaption: 'clean!' }],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    })

    const captions = [
      {
        postNumber: 1,
        date: '2026-05-01',
        caption: 'cheap!',
        hashtags: [],
        graphicHook: '',
        designerNotes: '',
      },
      {
        postNumber: 2,
        date: '2026-05-03',
        caption: 'fine',
        hashtags: [],
        graphicHook: '',
        designerNotes: '',
      },
    ]
    const result = await qaCaptions(captions, {
      dos: null,
      donts: 'never use cheap',
      brandVoice: null,
    })

    expect(result.posts[0].caption).toBe('clean!')
    expect(result.posts[0].originalCaption).toBe('cheap!')
    expect(result.posts[1].caption).toBe('fine')
    expect(result.posts[1].originalCaption).toBeUndefined()
  })
})

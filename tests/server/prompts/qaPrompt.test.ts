import { describe, it, expect } from 'vitest'
import { buildQaPrompt } from '@/server/prompts/qaPrompt'

describe('buildQaPrompt', () => {
  it('includes all three rule fields when provided', () => {
    const { user } = buildQaPrompt(
      {
        dos: 'always include price range',
        donts: 'never use cheap',
        brandVoice: 'friendly, expert',
      },
      [{ postNumber: 1, caption: 'cheap stuff!' }]
    )
    expect(user).toContain('always include price range')
    expect(user).toContain('never use cheap')
    expect(user).toContain('friendly, expert')
  })

  it('substitutes "(none provided)" for null or whitespace rule fields', () => {
    const { user } = buildQaPrompt(
      { dos: 'always include price range', donts: null, brandVoice: '   ' },
      [{ postNumber: 1, caption: 'hi' }]
    )
    // Two of three fields should render the sentinel
    const matches = user.match(/\(none provided\)/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('serializes captions as JSON in the user prompt', () => {
    const { user } = buildQaPrompt(
      { dos: 'x', donts: null, brandVoice: null },
      [
        { postNumber: 1, caption: 'hi' },
        { postNumber: 2, caption: 'bye' },
      ]
    )
    expect(user).toContain('"postNumber": 1')
    expect(user).toContain('"caption": "hi"')
    expect(user).toContain('"postNumber": 2')
    expect(user).toContain('"caption": "bye"')
  })

  it('system prompt includes role, operating principle, and example pair', () => {
    const { system } = buildQaPrompt(
      { dos: null, donts: null, brandVoice: null },
      []
    )
    expect(system).toContain('Conservative copy-QA editor')
    expect(system).toContain('Do nothing unless')
    expect(system).toContain('cheap')
    expect(system).toContain('NO VIOLATION')
  })
})

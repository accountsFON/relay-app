import { describe, it, expect } from 'vitest'
import { buildFixWithAiPrompt, buildFixWithAiPromptForPost } from '@/server/prompts/fixWithAiPrompt'

describe('buildFixWithAiPrompt', () => {
  it('renders all three brand context fields when present', () => {
    const { user } = buildFixWithAiPrompt({
      clientName: 'Acme Co',
      brandVoice: 'warm, knowledgeable, direct',
      dos: 'always include a CTA in the last line',
      donts: 'never use the word cheap',
      currentCaption: 'Welcome to our patio!',
      comments: [{ author: 'Caleb', body: 'make it warmer' }],
    })

    expect(user).toContain('Acme Co')
    expect(user).toContain('warm, knowledgeable, direct')
    expect(user).toContain('always include a CTA in the last line')
    expect(user).toContain('never use the word cheap')
    expect(user).toContain('Welcome to our patio!')
  })

  it('includes all comments in chronological order', () => {
    const { user } = buildFixWithAiPrompt({
      clientName: 'Acme',
      brandVoice: null,
      dos: null,
      donts: null,
      currentCaption: 'Hi',
      comments: [
        { author: 'Alice', body: 'first comment' },
        { author: 'Bob', body: 'second comment' },
        { author: 'Carol', body: 'third comment' },
      ],
    })

    const idxFirst = user.indexOf('first comment')
    const idxSecond = user.indexOf('second comment')
    const idxThird = user.indexOf('third comment')
    expect(idxFirst).toBeGreaterThan(-1)
    expect(idxSecond).toBeGreaterThan(idxFirst)
    expect(idxThird).toBeGreaterThan(idxSecond)
    expect(user).toContain('1. Alice: first comment')
    expect(user).toContain('2. Bob: second comment')
    expect(user).toContain('3. Carol: third comment')
  })

  it('safely renders comments and brand fields that contain quotes, newlines, and other special chars', () => {
    const tricky = 'They said "this won\'t work" — and\nhad newlines & <tags>'
    const { user, system } = buildFixWithAiPrompt({
      clientName: 'Q&A Co',
      brandVoice: 'use "scare quotes" sparingly',
      dos: 'do this',
      donts: 'no "fluff" ever',
      currentCaption: 'Caption with "quotes" and\nnewlines',
      comments: [{ author: 'Reviewer', body: tricky }],
    })

    // No template variables left unfilled.
    expect(user).not.toMatch(/\{[a-zA-Z]+\}/)
    expect(system).not.toMatch(/\{[a-zA-Z]+\}/)

    // All the tricky text survives verbatim. We are building a plain-text
    // prompt, not JSON, so we do not need to escape; we just need to make
    // sure nothing in the builder mangles the input.
    expect(user).toContain(tricky)
    expect(user).toContain('Q&A Co')
    expect(user).toContain('use "scare quotes" sparingly')
    expect(user).toContain('Caption with "quotes" and\nnewlines')
  })

  it('falls back to (none provided) when brand fields are null or whitespace', () => {
    const { user } = buildFixWithAiPrompt({
      clientName: 'Acme',
      brandVoice: null,
      dos: '   ',
      donts: '',
      currentCaption: 'x',
      comments: [],
    })
    expect(user).toContain('Brand voice: (none provided)')
    expect(user).toContain('Things to always do: (none provided)')
    expect(user).toContain('Things to never do: (none provided)')
    expect(user).toContain('(no comments)')
  })
})

describe('buildFixWithAiPromptForPost', () => {
  const base = {
    clientName: 'Acme',
    brandVoice: 'Punchy',
    dos: 'Be bold',
    donts: 'No jargon',
    currentCaption: 'Old caption here',
  }

  it('renders the verdict, the client suggested caption, and every pin comment', () => {
    const { system, user } = buildFixWithAiPromptForPost({
      ...base,
      verdict: 'changes_requested',
      suggestedCaption: 'A caption the client wrote',
      pins: [
        { location: 'caption', comments: [{ author: 'Jane', body: 'too long' }] },
        { location: 'post', comments: [{ author: 'Jane', body: 'add a CTA' }, { author: 'AM', body: 'agreed' }] },
      ],
    })

    expect(system).toContain('senior social media copy editor')
    expect(user).toContain('Old caption here')
    expect(user.toLowerCase()).toContain('changes')
    expect(user).toContain('A caption the client wrote')
    expect(user).toContain('too long')
    expect(user).toContain('add a CTA')
    expect(user).toContain('agreed')
    expect(user.toLowerCase()).toContain('caption')
    expect(user.toLowerCase()).toContain('post')
  })

  it('omits the suggested-caption block when none was provided and handles no pins', () => {
    const { user } = buildFixWithAiPromptForPost({
      ...base,
      verdict: 'none',
      suggestedCaption: null,
      pins: [],
    })
    expect(user).not.toContain('suggested caption')
    expect(user).toContain('(no pin comments)')
  })
})

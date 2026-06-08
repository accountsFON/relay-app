import { describe, it, expect } from 'vitest'
import { buildCaptionPrompt } from '@/server/prompts/captionPrompt'

describe('buildCaptionPrompt', () => {
  it('makes the Client Brief (profile) authoritative over crawled Facts on conflicts', () => {
    const { user } = buildCaptionPrompt('BRIEF TEXT', 'FACTS TEXT', [], {}, [])
    expect(user).toContain('Client Brief reflects the client profile and is authoritative')
    expect(user.toLowerCase()).toContain('contradicts the brief')
    expect(user.toLowerCase()).toContain('follow the brief')
  })
})

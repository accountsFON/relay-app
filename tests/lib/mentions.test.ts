import { describe, it, expect } from 'vitest'
import {
  handleFromName,
  parseHandles,
  resolveMentionedUserIds,
  buildMentionRoster,
  tokenizeBody,
} from '@/lib/mentions'

describe('handleFromName', () => {
  it('converts a two-word name to dotted lowercase', () => {
    expect(handleFromName('Julio Aleman')).toBe('julio.aleman')
    expect(handleFromName('Mollie Huebner')).toBe('mollie.huebner')
  })

  it('handles single names', () => {
    expect(handleFromName('Caleb')).toBe('caleb')
  })

  it('strips non-ASCII and normalizes accents', () => {
    expect(handleFromName('Renée Aleman')).toBe('renee.aleman')
    expect(handleFromName('X Æ A-12')).toBe('x.a12')
  })

  it('returns empty for blank input', () => {
    expect(handleFromName('')).toBe('')
    expect(handleFromName('   ')).toBe('')
  })
})

describe('parseHandles', () => {
  it('extracts handles from body', () => {
    expect(parseHandles('hey @julio.aleman take a look')).toEqual([
      'julio.aleman',
    ])
  })

  it('dedupes and lowercases', () => {
    expect(
      parseHandles('@Caleb pinged @caleb again, then @JULIO.ALEMAN replied')
    ).toEqual(['caleb', 'julio.aleman'])
  })

  it('returns [] when there are no handles', () => {
    expect(parseHandles('no mentions here')).toEqual([])
  })

  it('does not treat email addresses as mentions', () => {
    expect(parseHandles('email tom@gmail.com please')).toEqual([])
    expect(parseHandles('hello a@b.com')).toEqual([])
  })

  it('still matches at start-of-string or after whitespace', () => {
    expect(parseHandles('@julio start of string')).toEqual(['julio'])
    expect(parseHandles('mid sentence @julio works')).toEqual(['julio'])
  })
})

describe('resolveMentionedUserIds', () => {
  const roster = [
    { id: 'u1', name: 'Julio Aleman', handle: 'julio.aleman' },
    { id: 'u2', name: 'Caleb Cody', handle: 'caleb.cody' },
  ]

  it('maps handles to user ids', () => {
    expect(
      resolveMentionedUserIds('hey @julio.aleman and @caleb.cody', roster)
    ).toEqual(['u1', 'u2'])
  })

  it('drops unknown handles silently', () => {
    expect(resolveMentionedUserIds('@nobody.here yo', roster)).toEqual([])
  })

  it('dedupes when same user is mentioned twice', () => {
    expect(
      resolveMentionedUserIds('@julio.aleman and @julio.aleman', roster)
    ).toEqual(['u1'])
  })
})

describe('buildMentionRoster', () => {
  it('derives handles from member user names', () => {
    const roster = buildMentionRoster([
      { user: { id: 'u1', name: 'Julio Aleman' } },
      { user: { id: 'u2', name: 'Mollie Huebner' } },
    ])
    expect(roster).toEqual([
      { id: 'u1', name: 'Julio Aleman', handle: 'julio.aleman' },
      { id: 'u2', name: 'Mollie Huebner', handle: 'mollie.huebner' },
    ])
  })
})

describe('tokenizeBody', () => {
  it('tokenizes text and mention runs', () => {
    expect(tokenizeBody('hey @julio.aleman take a look')).toEqual([
      { type: 'text', value: 'hey ' },
      { type: 'mention', handle: 'julio.aleman', raw: '@julio.aleman' },
      { type: 'text', value: ' take a look' },
    ])
  })

  it('handles consecutive mentions', () => {
    expect(tokenizeBody('@a @b end')).toEqual([
      { type: 'mention', handle: 'a', raw: '@a' },
      { type: 'text', value: ' ' },
      { type: 'mention', handle: 'b', raw: '@b' },
      { type: 'text', value: ' end' },
    ])
  })

  it('returns one text token when no mentions', () => {
    expect(tokenizeBody('plain body')).toEqual([
      { type: 'text', value: 'plain body' },
    ])
  })
})

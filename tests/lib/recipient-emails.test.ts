import { describe, it, expect } from 'vitest'
import { parseRecipientEmails } from '@/lib/recipient-emails'

describe('parseRecipientEmails', () => {
  it('parses a single email', () => {
    expect(parseRecipientEmails('jane@client.com')).toEqual({
      emails: ['jane@client.com'],
      invalid: [],
    })
  })

  it('parses multiple comma-separated emails and trims whitespace', () => {
    expect(parseRecipientEmails('  jane@client.com ,bob@client.com,  sam@x.co ')).toEqual({
      emails: ['jane@client.com', 'bob@client.com', 'sam@x.co'],
      invalid: [],
    })
  })

  it('also splits on semicolons and newlines', () => {
    expect(parseRecipientEmails('a@x.com; b@x.com\nc@x.com').emails).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ])
  })

  it('drops empty tokens from trailing / doubled separators', () => {
    expect(parseRecipientEmails('a@x.com,,b@x.com,').emails).toEqual([
      'a@x.com',
      'b@x.com',
    ])
  })

  it('dedupes case-insensitively, preserving the first occurrence + order', () => {
    expect(parseRecipientEmails('Jane@Client.com, bob@x.com, jane@client.com').emails).toEqual([
      'Jane@Client.com',
      'bob@x.com',
    ])
  })

  it('separates invalid tokens from valid ones', () => {
    const result = parseRecipientEmails('jane@client.com, not-an-email, bob@x.com')
    expect(result.emails).toEqual(['jane@client.com', 'bob@x.com'])
    expect(result.invalid).toEqual(['not-an-email'])
  })

  it('returns empty arrays for an empty / whitespace string', () => {
    expect(parseRecipientEmails('   ')).toEqual({ emails: [], invalid: [] })
  })
})

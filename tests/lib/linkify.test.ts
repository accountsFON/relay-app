import { describe, it, expect } from 'vitest'
import { splitOnUrls, normalizeHref } from '@/lib/linkify'

describe('normalizeHref', () => {
  it('passes through http(s) URLs unchanged', () => {
    expect(normalizeHref('https://example.com/x')).toBe('https://example.com/x')
    expect(normalizeHref('http://example.com')).toBe('http://example.com')
  })
  it('prefixes bare www. URLs with https://', () => {
    expect(normalizeHref('www.example.com')).toBe('https://www.example.com')
  })
})

describe('splitOnUrls', () => {
  it('returns a single text token when there is no URL', () => {
    expect(splitOnUrls('just some words')).toEqual([
      { type: 'text', value: 'just some words' },
    ])
  })

  it('splits an http URL out of surrounding text', () => {
    expect(splitOnUrls('see https://example.com/path now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://example.com/path', value: 'https://example.com/path' },
      { type: 'text', value: ' now' },
    ])
  })

  it('detects a bare www. URL and builds an https href', () => {
    expect(splitOnUrls('go to www.example.com')).toEqual([
      { type: 'text', value: 'go to ' },
      { type: 'link', href: 'https://www.example.com', value: 'www.example.com' },
    ])
  })

  it('keeps trailing sentence punctuation out of the link', () => {
    expect(splitOnUrls('open https://example.com.')).toEqual([
      { type: 'text', value: 'open ' },
      { type: 'link', href: 'https://example.com', value: 'https://example.com' },
      { type: 'text', value: '.' },
    ])
  })

  it('handles multiple URLs in one string', () => {
    expect(splitOnUrls('a http://a.com b https://b.com')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'link', href: 'http://a.com', value: 'http://a.com' },
      { type: 'text', value: ' b ' },
      { type: 'link', href: 'https://b.com', value: 'https://b.com' },
    ])
  })

  it('returns nothing for an empty string', () => {
    expect(splitOnUrls('')).toEqual([])
  })
})

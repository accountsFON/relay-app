import { describe, it, expect } from 'vitest'
import { normalizeBrandColor, normalizeBrandLogoUrl } from '@/lib/org-branding'

describe('normalizeBrandColor', () => {
  it('accepts #rrggbb and #rgb (trimmed)', () => {
    expect(normalizeBrandColor('#0a84ff')).toBe('#0a84ff')
    expect(normalizeBrandColor('#FFF')).toBe('#FFF')
    expect(normalizeBrandColor('  #ABCDEF ')).toBe('#ABCDEF')
  })

  it('rejects non-hex, wrong length, empty, and nullish', () => {
    expect(normalizeBrandColor('red')).toBeNull()
    expect(normalizeBrandColor('#12')).toBeNull()
    expect(normalizeBrandColor('0a84ff')).toBeNull() // missing #
    expect(normalizeBrandColor('')).toBeNull()
    expect(normalizeBrandColor(null)).toBeNull()
    expect(normalizeBrandColor(undefined)).toBeNull()
  })
})

describe('normalizeBrandLogoUrl', () => {
  it('accepts http/https URLs (trimmed)', () => {
    expect(normalizeBrandLogoUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    )
    expect(normalizeBrandLogoUrl(' http://x.co/l.svg ')).toBe('http://x.co/l.svg')
  })

  it('rejects non-http(s) schemes, non-URLs, empty, and nullish', () => {
    expect(normalizeBrandLogoUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBrandLogoUrl('data:image/png;base64,abc')).toBeNull()
    expect(normalizeBrandLogoUrl('not a url')).toBeNull()
    expect(normalizeBrandLogoUrl('')).toBeNull()
    expect(normalizeBrandLogoUrl(null)).toBeNull()
    expect(normalizeBrandLogoUrl(undefined)).toBeNull()
  })
})

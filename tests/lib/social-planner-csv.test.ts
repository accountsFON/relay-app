import { describe, it, expect } from 'vitest'
import { toSocialPlannerCsv } from '@/lib/social-planner-csv'

describe('toSocialPlannerCsv', () => {
  it('emits the exact Social Planner header', () => {
    expect(toSocialPlannerCsv([])).toBe(
      'postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls',
    )
  })

  it('builds a row: 08:00 time, quoted multiline content, uploaded image in imageUrls', () => {
    const csv = toSocialPlannerCsv([
      {
        date: '2026-06-15',
        caption: 'Check out our new service! 🎉\n\nWe are excited.',
        hashtags: '#marketing #social',
        mediaUrl: 'https://blob.test/post-media/abc/x.png',
      },
    ])
    expect(csv.split('\r\n')[1]).toBe(
      '2026-06-15 08:00,"Check out our new service! 🎉\n\nWe are excited.\n\n#marketing #social",,https://blob.test/post-media/abc/x.png,,',
    )
  })

  it('falls back to https://# when the post has no image', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-17', caption: 'Simple post with no special characters', hashtags: '', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')[1]).toBe(
      '2026-06-17 08:00,Simple post with no special characters,,https://#,,',
    )
  })

  it('escapes double quotes in content by doubling them', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-18', caption: 'He said "hi"', hashtags: '', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')[1]).toBe('2026-06-18 08:00,"He said ""hi""",,https://#,,')
  })

  it('quotes content containing a comma', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-19', caption: 'one, two, three', hashtags: '', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')[1]).toBe('2026-06-19 08:00,"one, two, three",,https://#,,')
  })

  it('emits hashtags only (no leading blank lines) when caption is blank', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-20', caption: '   ', hashtags: '#solo', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')[1]).toBe('2026-06-20 08:00,#solo,,https://#,,')
  })

  it('joins header + rows with CRLF', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-21', caption: 'a', hashtags: '', mediaUrl: '' },
      { date: '2026-06-22', caption: 'b', hashtags: '', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('trims leading/trailing blank lines from caption but keeps interior spacing', () => {
    const csv = toSocialPlannerCsv([
      { date: '2026-06-23', caption: '\n\nline1\n\nline2\n\n', hashtags: '#x', mediaUrl: '' },
    ])
    expect(csv.split('\r\n')[1]).toBe('2026-06-23 08:00,"line1\n\nline2\n\n#x",,https://#,,')
  })
})

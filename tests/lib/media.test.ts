import { describe, it, expect } from 'vitest'
import { matchFilenameToPost, type MatchablePost } from '@/lib/media'

/**
 * Tests for the pure filename-to-post matcher used by the bulk media tray.
 *
 * Patterns under test:
 *  - "MM-DD.{ext}" matches by month and day of the post's postDate (UTC).
 *  - "N.{ext}" or "0N.{ext}" matches the Nth post when sorted by postDate
 *    ascending, 1-indexed.
 *  - Anything else returns null.
 */

const day = (mm: number, dd: number): Date =>
  new Date(Date.UTC(2026, mm - 1, dd))

const posts: ReadonlyArray<MatchablePost> = [
  { id: 'p-may10', postDate: day(5, 10) },
  { id: 'p-may12', postDate: day(5, 12) },
  { id: 'p-may15', postDate: day(5, 15) },
]

describe('matchFilenameToPost', () => {
  it('matches MM-DD.{ext} to the post with that month and day', () => {
    expect(matchFilenameToPost('05-12.jpg', posts)).toBe('p-may12')
    expect(matchFilenameToPost('05-15.png', posts)).toBe('p-may15')
    // Single-digit MM-D variant also accepted.
    expect(matchFilenameToPost('5-10.jpg', posts)).toBe('p-may10')
  })

  it('matches N.{ext} and 0N.{ext} to the Nth post sorted by date ascending', () => {
    // posts sorted asc: p-may10, p-may12, p-may15
    expect(matchFilenameToPost('1.jpg', posts)).toBe('p-may10')
    expect(matchFilenameToPost('01.png', posts)).toBe('p-may10')
    expect(matchFilenameToPost('2.jpg', posts)).toBe('p-may12')
    expect(matchFilenameToPost('03.jpeg', posts)).toBe('p-may15')
  })

  it('returns null when no pattern matches', () => {
    // Random name with no recognizable pattern.
    expect(matchFilenameToPost('vacation-pic.jpg', posts)).toBeNull()
    // Out-of-range date.
    expect(matchFilenameToPost('05-31.jpg', posts)).toBeNull()
    // Out-of-range index.
    expect(matchFilenameToPost('99.jpg', posts)).toBeNull()
    // Empty filename.
    expect(matchFilenameToPost('', posts)).toBeNull()
    // Empty post list.
    expect(matchFilenameToPost('1.jpg', [])).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  matchFilenameToPost,
  fillEmptyPostSlots,
  type MatchablePost,
} from '@/lib/media-match'

const posts: MatchablePost[] = [
  { id: 'p1', postDate: new Date(Date.UTC(2026, 4, 3)) }, // May 3
  { id: 'p2', postDate: new Date(Date.UTC(2026, 4, 12)) }, // May 12
  { id: 'p3', postDate: new Date(Date.UTC(2026, 4, 19)) }, // May 19
  { id: 'p4', postDate: new Date(Date.UTC(2026, 4, 26)) }, // May 26
]

describe('matchFilenameToPost', () => {
  it('returns null for empty filename', () => {
    expect(matchFilenameToPost('', posts)).toBeNull()
  })

  it('returns null for empty post list', () => {
    expect(matchFilenameToPost('FON1.jpg', [])).toBeNull()
  })

  describe('MM-DD pattern', () => {
    it('matches the post on the named day', () => {
      expect(matchFilenameToPost('05-12.jpg', posts)).toBe('p2')
    })

    it('accepts single-digit months and days', () => {
      expect(matchFilenameToPost('5-3.jpg', posts)).toBe('p1')
    })

    it('returns null when no post is on that date', () => {
      expect(matchFilenameToPost('05-15.jpg', posts)).toBeNull()
    })
  })

  describe('position pattern', () => {
    it('matches a purely numeric stem to the 1-indexed position', () => {
      expect(matchFilenameToPost('1.jpg', posts)).toBe('p1')
      expect(matchFilenameToPost('3.png', posts)).toBe('p3')
    })

    it('strips leading zeros', () => {
      expect(matchFilenameToPost('01.jpg', posts)).toBe('p1')
      expect(matchFilenameToPost('003.jpg', posts)).toBe('p3')
    })

    it('matches client-prefixed names like FON1, FON2', () => {
      expect(matchFilenameToPost('FON1.jpg', posts)).toBe('p1')
      expect(matchFilenameToPost('FON2.jpg', posts)).toBe('p2')
      expect(matchFilenameToPost('FON4.jpg', posts)).toBe('p4')
    })

    it('matches separator variants (FON_1, FON-1, fon1)', () => {
      expect(matchFilenameToPost('FON_2.jpg', posts)).toBe('p2')
      expect(matchFilenameToPost('FON-3.jpg', posts)).toBe('p3')
      expect(matchFilenameToPost('fon4.png', posts)).toBe('p4')
    })

    it('handles double-digit suffixes', () => {
      const tenPosts: MatchablePost[] = Array.from({ length: 12 }, (_, i) => ({
        id: `p${i + 1}`,
        postDate: new Date(Date.UTC(2026, 4, i + 1)),
      }))
      expect(matchFilenameToPost('FON10.jpg', tenPosts)).toBe('p10')
      expect(matchFilenameToPost('FON12.jpg', tenPosts)).toBe('p12')
    })

    it('returns null when position is out of range', () => {
      expect(matchFilenameToPost('FON99.jpg', posts)).toBeNull()
    })
  })

  it('returns null for non-matching patterns', () => {
    expect(matchFilenameToPost('hero.jpg', posts)).toBeNull()
    expect(matchFilenameToPost('random_name.png', posts)).toBeNull()
  })
})

describe('fillEmptyPostSlots', () => {
  const orderedPostIds = ['p1', 'p2', 'p3', 'p4']

  it('assigns unassigned files to empty slots in order', () => {
    const files = [
      { fileId: 'a', assignedPostId: null },
      { fileId: 'b', assignedPostId: null },
    ]
    const result = fillEmptyPostSlots(files, orderedPostIds)
    expect(result.map((f) => f.assignedPostId)).toEqual(['p1', 'p2'])
  })

  it('preserves pre-assigned files and fills only the remaining empty slots', () => {
    // 'a' already matched to p2 (e.g. via filename); the unassigned files fill
    // the empty slots (p1, p3, p4) in order, skipping the claimed p2.
    const files = [
      { fileId: 'a', assignedPostId: 'p2' },
      { fileId: 'b', assignedPostId: null },
      { fileId: 'c', assignedPostId: null },
    ]
    const result = fillEmptyPostSlots(files, orderedPostIds)
    const byId = Object.fromEntries(result.map((f) => [f.fileId, f.assignedPostId]))
    expect(byId).toEqual({ a: 'p2', b: 'p1', c: 'p3' })
  })

  it('leaves extra files unassigned when there are more files than empty slots', () => {
    const files = [
      { fileId: 'a', assignedPostId: null },
      { fileId: 'b', assignedPostId: null },
    ]
    const result = fillEmptyPostSlots(files, ['p1'])
    expect(result.map((f) => f.assignedPostId)).toEqual(['p1', null])
  })

  it('is a no-op when every slot is already claimed', () => {
    const files = [
      { fileId: 'a', assignedPostId: 'p1' },
      { fileId: 'b', assignedPostId: null },
    ]
    const result = fillEmptyPostSlots(files, ['p1'])
    expect(result.map((f) => f.assignedPostId)).toEqual(['p1', null])
  })

  it('does not mutate the input array or its items', () => {
    const files = [{ fileId: 'a', assignedPostId: null }]
    const snapshot = structuredClone(files)
    fillEmptyPostSlots(files, orderedPostIds)
    expect(files).toEqual(snapshot)
  })

  it('handles empty inputs', () => {
    expect(fillEmptyPostSlots([], orderedPostIds)).toEqual([])
    expect(
      fillEmptyPostSlots([{ fileId: 'a', assignedPostId: null }], []),
    ).toEqual([{ fileId: 'a', assignedPostId: null }])
  })
})

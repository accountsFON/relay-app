import { describe, it, expect } from 'vitest'
import { buildPostNumberMap } from '@/lib/post-numbering'

describe('buildPostNumberMap', () => {
  it('numbers posts 1-based within each batch, in input (postDate asc) order', () => {
    const map = buildPostNumberMap([
      { id: 'a', batchId: 'b1' },
      { id: 'b', batchId: 'b1' },
      { id: 'c', batchId: 'b2' },
      { id: 'd', batchId: 'b1' },
      { id: 'e', batchId: 'b2' },
    ])
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
    expect(map.get('d')).toBe(3)
    // Second batch numbers independently.
    expect(map.get('c')).toBe(1)
    expect(map.get('e')).toBe(2)
  })

  it('skips posts with no batch', () => {
    const map = buildPostNumberMap([
      { id: 'x', batchId: null },
      { id: 'y', batchId: 'b1' },
    ])
    expect(map.has('x')).toBe(false)
    expect(map.get('y')).toBe(1)
  })

  it('returns an empty map for no posts', () => {
    expect(buildPostNumberMap([]).size).toBe(0)
  })
})

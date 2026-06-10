import { describe, it, expect } from 'vitest'
import { paginateMentions } from '@/lib/paginate-mentions'

describe('paginateMentions', () => {
  it('reports hasMore and trims the probe row when more exist', () => {
    // Caller over-fetches pageSize + 1 to detect a next page cheaply.
    const rows = Array.from({ length: 11 }, (_, i) => i)
    const { visible, hasMore } = paginateMentions(rows, 10)
    expect(visible).toHaveLength(10)
    expect(visible[9]).toBe(9) // probe row (index 10) dropped
    expect(hasMore).toBe(true)
  })

  it('reports no more when the page is not full', () => {
    const rows = [0, 1, 2]
    const { visible, hasMore } = paginateMentions(rows, 10)
    expect(visible).toHaveLength(3)
    expect(hasMore).toBe(false)
  })

  it('reports no more when exactly pageSize rows are returned', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i)
    const { visible, hasMore } = paginateMentions(rows, 10)
    expect(visible).toHaveLength(10)
    expect(hasMore).toBe(false)
  })
})

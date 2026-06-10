import { describe, it, expect } from 'vitest'
import { computeCanvasDrawArgs } from '@/lib/avatar-crop'

describe('computeCanvasDrawArgs', () => {
  it('maps the crop rect to a square output canvas', () => {
    const args = computeCanvasDrawArgs({ x: 10, y: 20, width: 200, height: 200 }, 512)
    expect(args).toEqual({
      sx: 10, sy: 20, sWidth: 200, sHeight: 200,
      dx: 0, dy: 0, dWidth: 512, dHeight: 512,
    })
  })
})

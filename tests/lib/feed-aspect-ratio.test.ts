import { describe, it, expect } from 'vitest'
import {
  clampInstagramAspectRatio,
  facebookAspectRatio,
  IG_MIN_ASPECT_RATIO,
  IG_MAX_ASPECT_RATIO,
  IG_DEFAULT_ASPECT_RATIO,
  FB_DEFAULT_ASPECT_RATIO,
} from '@/lib/feed-aspect-ratio'

describe('clampInstagramAspectRatio', () => {
  it('returns the IG default (1:1 square) when the natural ratio is unknown', () => {
    expect(clampInstagramAspectRatio(null)).toBe(IG_DEFAULT_ASPECT_RATIO)
    expect(clampInstagramAspectRatio(undefined)).toBe(IG_DEFAULT_ASPECT_RATIO)
  })

  it('rejects non finite and non positive ratios, falling back to the default', () => {
    expect(clampInstagramAspectRatio(Number.NaN)).toBe(IG_DEFAULT_ASPECT_RATIO)
    expect(clampInstagramAspectRatio(Number.POSITIVE_INFINITY)).toBe(IG_DEFAULT_ASPECT_RATIO)
    expect(clampInstagramAspectRatio(0)).toBe(IG_DEFAULT_ASPECT_RATIO)
    expect(clampInstagramAspectRatio(-1.5)).toBe(IG_DEFAULT_ASPECT_RATIO)
  })

  it('returns the natural ratio when it falls inside the IG range', () => {
    // 1:1 square
    expect(clampInstagramAspectRatio(1)).toBe(1)
    // 4:5 portrait (exact lower bound)
    expect(clampInstagramAspectRatio(IG_MIN_ASPECT_RATIO)).toBeCloseTo(IG_MIN_ASPECT_RATIO)
    // 1.91:1 landscape (exact upper bound)
    expect(clampInstagramAspectRatio(IG_MAX_ASPECT_RATIO)).toBeCloseTo(IG_MAX_ASPECT_RATIO)
    // 16:9 horizontal video still (≈1.78, in range)
    expect(clampInstagramAspectRatio(16 / 9)).toBeCloseTo(16 / 9)
    // 3:4 (0.75) is just below the portrait floor; clamps up
    expect(clampInstagramAspectRatio(0.75)).toBe(IG_MIN_ASPECT_RATIO)
  })

  it('clamps tall portrait input (9:16 phone vertical) to the IG portrait floor (4:5)', () => {
    expect(clampInstagramAspectRatio(9 / 16)).toBe(IG_MIN_ASPECT_RATIO)
  })

  it('clamps ultra wide input (3:1 panorama) to the IG landscape ceiling (1.91:1)', () => {
    expect(clampInstagramAspectRatio(3)).toBe(IG_MAX_ASPECT_RATIO)
  })
})

describe('facebookAspectRatio', () => {
  it('returns the FB default (1.91:1 landscape) when the natural ratio is unknown', () => {
    expect(facebookAspectRatio(null)).toBe(FB_DEFAULT_ASPECT_RATIO)
    expect(facebookAspectRatio(undefined)).toBe(FB_DEFAULT_ASPECT_RATIO)
  })

  it('rejects non finite and non positive ratios, falling back to the default', () => {
    expect(facebookAspectRatio(Number.NaN)).toBe(FB_DEFAULT_ASPECT_RATIO)
    expect(facebookAspectRatio(Number.POSITIVE_INFINITY)).toBe(FB_DEFAULT_ASPECT_RATIO)
    expect(facebookAspectRatio(0)).toBe(FB_DEFAULT_ASPECT_RATIO)
    expect(facebookAspectRatio(-2)).toBe(FB_DEFAULT_ASPECT_RATIO)
  })

  it('passes the natural ratio through unchanged regardless of orientation', () => {
    expect(facebookAspectRatio(1)).toBe(1)
    expect(facebookAspectRatio(16 / 9)).toBeCloseTo(16 / 9)
    expect(facebookAspectRatio(4 / 5)).toBeCloseTo(4 / 5)
    // Ultra wide and ultra tall are intentionally NOT clamped on FB.
    expect(facebookAspectRatio(3)).toBe(3)
    expect(facebookAspectRatio(9 / 16)).toBeCloseTo(9 / 16)
  })
})

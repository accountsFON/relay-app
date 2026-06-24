import { describe, it, expect } from 'vitest'
import { diffText, type DiffSegment } from '@/lib/text-diff'

/**
 * Word-level diff contract:
 *   - equal+delete segments joined reproduce the old string
 *   - equal+insert segments joined reproduce the new string
 *   - single-word changes do not blow up into character-level noise
 *   - whitespace (including newlines) is preserved in segment text
 *   - special chars ($, /, etc.) are treated as part of their adjacent token
 */

function rebuildOld(segments: DiffSegment[]): string {
  return segments
    .filter((s) => s.type === 'equal' || s.type === 'delete')
    .map((s) => s.text)
    .join('')
}

function rebuildNew(segments: DiffSegment[]): string {
  return segments
    .filter((s) => s.type === 'equal' || s.type === 'insert')
    .map((s) => s.text)
    .join('')
}

describe('diffText , edge cases', () => {
  it('returns empty array for two empty strings', () => {
    expect(diffText('', '')).toEqual([])
  })

  it('returns a single equal segment when the strings are identical', () => {
    const result = diffText('Hello world', 'Hello world')
    expect(result).toEqual([{ type: 'equal', text: 'Hello world' }])
  })

  it('returns a single insert when the old string is empty', () => {
    expect(diffText('', 'new caption')).toEqual([
      { type: 'insert', text: 'new caption' },
    ])
  })

  it('returns a single delete when the new string is empty', () => {
    expect(diffText('old caption', '')).toEqual([
      { type: 'delete', text: 'old caption' },
    ])
  })
})

describe('diffText , word-level diffs', () => {
  it('single word change: "Hello world" -> "Hello there" emits a delete+insert pair around the changed word', () => {
    const segments = diffText('Hello world', 'Hello there')

    // Round-trip contract holds.
    expect(rebuildOld(segments)).toBe('Hello world')
    expect(rebuildNew(segments)).toBe('Hello there')

    // The shared "Hello " prefix is an equal segment, not character-level noise.
    expect(segments.some((s) => s.type === 'equal' && s.text.includes('Hello'))).toBe(true)

    // The change is expressed as a delete of "world" and an insert of "there",
    // not as a character-by-character churn.
    const deletes = segments.filter((s) => s.type === 'delete').map((s) => s.text)
    const inserts = segments.filter((s) => s.type === 'insert').map((s) => s.text)
    expect(deletes.join('')).toBe('world')
    expect(inserts.join('')).toBe('there')
  })

  it('paragraph restructure: "Foo\\n\\nBar" -> "Foo\\nBar" surfaces the newline change as a visible delta', () => {
    const segments = diffText('Foo\n\nBar', 'Foo\nBar')

    // Round-trip contract holds.
    expect(rebuildOld(segments)).toBe('Foo\n\nBar')
    expect(rebuildNew(segments)).toBe('Foo\nBar')

    // At least one non-equal segment must exist and must contain a newline ,
    // otherwise the diff would be invisible when rendered.
    const nonEqualWithNewline = segments.some(
      (s) => s.type !== 'equal' && s.text.includes('\n'),
    )
    expect(nonEqualWithNewline).toBe(true)
  })

  it('special chars preserved: "Cost: $10/unit" -> "Cost: $15/unit" handles $ and / cleanly', () => {
    const segments = diffText('Cost: $10/unit', 'Cost: $15/unit')

    // Round-trip contract holds.
    expect(rebuildOld(segments)).toBe('Cost: $10/unit')
    expect(rebuildNew(segments)).toBe('Cost: $15/unit')

    // The only numeric difference is 10 vs 15; "/unit" survives as part of an
    // equal-or-shared run, never lost mid-segment.
    expect(rebuildOld(segments)).toContain('/unit')
    expect(rebuildNew(segments)).toContain('/unit')
    expect(rebuildOld(segments)).toContain('Cost: $')
    expect(rebuildNew(segments)).toContain('Cost: $')

    const deletes = segments.filter((s) => s.type === 'delete').map((s) => s.text).join('')
    const inserts = segments.filter((s) => s.type === 'insert').map((s) => s.text).join('')
    expect(deletes).toContain('10')
    expect(inserts).toContain('15')
  })
})

describe('diffText , emoji (grapheme) safety', () => {
  it('leaves an unchanged surrogate-pair emoji intact (not split)', () => {
    const segments = diffText('I love pizza 🍕', 'I adore pizza 🍕')

    expect(rebuildOld(segments)).toBe('I love pizza 🍕')
    expect(rebuildNew(segments)).toBe('I adore pizza 🍕')

    // The pizza emoji is never torn apart: it appears whole in an equal segment
    // and never inside an insert/delete.
    expect(segments.some((s) => s.type === 'equal' && s.text.includes('🍕'))).toBe(true)
    expect(segments.some((s) => s.type !== 'equal' && s.text.includes('🍕'))).toBe(false)
  })

  it('marks a changed emoji as a whole delete + insert', () => {
    const segments = diffText('Dinner 🍕 tonight', 'Dinner 🍔 tonight')

    expect(rebuildOld(segments)).toBe('Dinner 🍕 tonight')
    expect(rebuildNew(segments)).toBe('Dinner 🍔 tonight')

    const deletes = segments.filter((s) => s.type === 'delete').map((s) => s.text).join('')
    const inserts = segments.filter((s) => s.type === 'insert').map((s) => s.text).join('')
    expect(deletes).toContain('🍕')
    expect(inserts).toContain('🍔')
  })

  it('treats ZWJ family, skin-tone, and flag emoji as single indivisible tokens', () => {
    const family = '👨‍👩‍👧‍👦'
    const thumb = '👍🏽'
    const flag = '🇺🇸'
    const oldText = `Team ${family} win ${thumb} go ${flag}`
    const newText = `Crew ${family} win ${thumb} go ${flag}`

    const segments = diffText(oldText, newText)

    // Reconstruction contract holds with multi-codepoint clusters present.
    expect(rebuildOld(segments)).toBe(oldText)
    expect(rebuildNew(segments)).toBe(newText)

    // None of the three clusters is split across segment boundaries: each shows
    // up whole, only inside equal segments (they were unchanged).
    for (const cluster of [family, thumb, flag]) {
      expect(segments.some((s) => s.type === 'equal' && s.text.includes(cluster))).toBe(true)
      expect(segments.some((s) => s.type !== 'equal' && s.text.includes(cluster))).toBe(false)
    }
  })

  it('handles adding an emoji to a plain caption', () => {
    const segments = diffText('Open house Saturday', 'Open house Saturday 🎉')
    expect(rebuildOld(segments)).toBe('Open house Saturday')
    expect(rebuildNew(segments)).toBe('Open house Saturday 🎉')
    const inserts = segments.filter((s) => s.type === 'insert').map((s) => s.text).join('')
    expect(inserts).toContain('🎉')
  })

  it('keeps a skin-tone-modified emoji whole when only the modifier changes', () => {
    const segments = diffText('go 👍🏽 team', 'go 👍🏿 team')

    expect(rebuildOld(segments)).toBe('go 👍🏽 team')
    expect(rebuildNew(segments)).toBe('go 👍🏿 team')

    // The change is the WHOLE thumb emoji, not a stray skin-tone modifier.
    // (The old code-unit tokenizer left "👍" in an equal segment and only
    // diffed the bare modifier "🏽"/"🏿", which renders as garbage.)
    const del = segments.filter((s) => s.type === 'delete').map((s) => s.text).join('')
    const ins = segments.filter((s) => s.type === 'insert').map((s) => s.text).join('')
    expect(del).toBe('👍🏽')
    expect(ins).toBe('👍🏿')
    expect(segments.some((s) => s.type === 'equal' && s.text.includes('👍'))).toBe(false)
  })

  it('treats a ZWJ family glued to surrounding words as one token when it grows', () => {
    const segments = diffText('great👨‍👩‍👧deal', 'great👨‍👩‍👧‍👦deal')

    expect(rebuildOld(segments)).toBe('great👨‍👩‍👧deal')
    expect(rebuildNew(segments)).toBe('great👨‍👩‍👧‍👦deal')

    const del = segments.filter((s) => s.type === 'delete').map((s) => s.text).join('')
    const ins = segments.filter((s) => s.type === 'insert').map((s) => s.text).join('')
    expect(del).toBe('👨‍👩‍👧')
    expect(ins).toBe('👨‍👩‍👧‍👦')
    // No stray leading ZWJ fragment (the old code emitted a bare "‍👦").
    expect(segments.some((s) => /^‍/.test(s.text))).toBe(false)
  })
})

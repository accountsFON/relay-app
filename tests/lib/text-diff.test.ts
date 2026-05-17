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

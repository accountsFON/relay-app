/**
 * Word-level diff for caption rewrites and reviewer edits.
 *
 * Used by:
 *   - the Fix with AI flow (server-side, to show the AM what changed between
 *     the original caption and the AI-proposed rewrite)
 *   - the v2 review session AM-side CaptionDiffView (client-side, to show what
 *     the reviewer changed inline)
 *
 * Tokenization is grapheme-aware via `Intl.Segmenter` (granularity 'word'), so
 * multi-codepoint emoji (surrogate pairs, skin-tone modifiers, ZWJ families,
 * regional-flag pairs) are kept as single indivisible tokens and never split
 * mid-grapheme. Segmenter segments are a non-overlapping full partition of the
 * input, so the reconstruction contract below holds exactly. We diff the token
 * arrays with jsdiff's `diffArrays` and join each part's tokens back into text.
 *
 * Concat of equal+delete segments reproduces the old string exactly; concat of
 * equal+insert reproduces the new string. That contract is asserted by the
 * text-diff tests and must not be broken.
 */

import { diffArrays } from 'diff'

export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

/**
 * Split text into grapheme-safe word/whitespace tokens. The returned array is a
 * full partition of `text` (joining it reproduces the input). Falls back to a
 * code-unit-safe word/space regex if `Intl.Segmenter` is unavailable.
 */
function tokenize(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    return Array.from(segmenter.segment(text), (s) => s.segment)
  }
  return text.match(/\s+|\S+/g) ?? []
}

export function diffText(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) {
    return oldText === '' ? [] : [{ type: 'equal', text: oldText }]
  }
  if (oldText === '') {
    return [{ type: 'insert', text: newText }]
  }
  if (newText === '') {
    return [{ type: 'delete', text: oldText }]
  }
  const parts = diffArrays(tokenize(oldText), tokenize(newText))
  return parts.map((part) => ({
    type: part.added ? 'insert' : part.removed ? 'delete' : 'equal',
    text: part.value.join(''),
  }))
}

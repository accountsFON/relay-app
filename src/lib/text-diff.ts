/**
 * Word-level diff for caption rewrites and reviewer edits.
 *
 * Used by:
 *   - the Fix with AI flow (server-side, to show the AM what changed between
 *     the original caption and the AI-proposed rewrite)
 *   - the v2 review session AM-side CaptionDiffView (client-side, to show what
 *     the reviewer changed inline)
 *
 * Implementation wraps jsdiff's `diffWordsWithSpace` which produces token-level
 * segments that preserve whitespace exactly. We map jsdiff's
 * `{ added, removed, value }` shape onto our `DiffSegment` shape so existing
 * callers keep working without changes.
 *
 * Concat of equal+delete segments reproduces the old string exactly; concat of
 * equal+insert reproduces the new string. That contract is asserted by the
 * fixWithAi tests and must not be broken.
 */

import { diffWordsWithSpace } from 'diff'

export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete'
  text: string
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
  const parts = diffWordsWithSpace(oldText, newText)
  return parts.map((part) => ({
    type: part.added ? 'insert' : part.removed ? 'delete' : 'equal',
    text: part.value,
  }))
}

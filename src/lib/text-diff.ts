/**
 * Minimal word-level diff for caption rewrites.
 *
 * Used by the Fix with AI flow to show the AM what changed between the
 * original caption and the AI-proposed rewrite. Diff is computed against
 * whitespace-and-punctuation-boundary tokens so single-word changes don't
 * blow up into character-level noise.
 *
 * Implementation is a standard LCS-based diff (Myers-style). Output is a
 * flat segment list with `equal`, `insert`, and `delete` ops, in render
 * order, suitable for direct rendering in the DiffModal (Layer 3 task 3.1).
 *
 * No external dependency. The diff lib ecosystem (diff, diff-match-patch)
 * is overkill for caption-sized strings; this keeps the surface small.
 */

export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

/**
 * Split a string into render-preserving tokens. Each token is either a
 * "word" (sequence of non-whitespace chars) or a whitespace run. Concat of
 * the tokens equals the input exactly.
 */
function tokenize(input: string): string[] {
  if (input === '') return []
  // Match whitespace runs OR non-whitespace runs. The g flag with this
  // alternation covers every char exactly once.
  const matches = input.match(/\s+|\S+/g)
  return matches ?? []
}

/**
 * Compute LCS lengths table for two token arrays. Classic O(n*m) DP. For
 * caption-sized inputs (< a few hundred tokens) this is trivially fast.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length
  const m = b.length
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
  }
  return table
}

/**
 * Walk the LCS table from the bottom-right corner to produce an in-order
 * sequence of operations, then merge adjacent same-type ops into single
 * segments so the renderer doesn't have to.
 */
function buildSegments(a: string[], b: string[], table: number[][]): DiffSegment[] {
  const ops: DiffSegment[] = []
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', text: a[i - 1] })
      i--
      j--
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      ops.push({ type: 'delete', text: a[i - 1] })
      i--
    } else {
      ops.push({ type: 'insert', text: b[j - 1] })
      j--
    }
  }
  while (i > 0) {
    ops.push({ type: 'delete', text: a[i - 1] })
    i--
  }
  while (j > 0) {
    ops.push({ type: 'insert', text: b[j - 1] })
    j--
  }
  ops.reverse()

  // Merge runs of same type.
  const merged: DiffSegment[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) {
      last.text += op.text
    } else {
      merged.push({ type: op.type, text: op.text })
    }
  }
  return merged
}

export function diffText(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) {
    return oldText === '' ? [] : [{ type: 'equal', text: oldText }]
  }
  const a = tokenize(oldText)
  const b = tokenize(newText)
  if (a.length === 0) return [{ type: 'insert', text: newText }]
  if (b.length === 0) return [{ type: 'delete', text: oldText }]
  const table = lcsTable(a, b)
  return buildSegments(a, b, table)
}

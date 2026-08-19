import { describe, it, expect } from 'vitest'
import {
  postSaveErrorMessage,
  isPostSaveReason,
  POST_SAVE_UNEXPECTED,
} from '@/lib/post-save-error'

describe('postSaveErrorMessage', () => {
  it('names the exact permission toggle an admin has to flip', () => {
    // The key is labelled "Edit captions / hashtags" in the permissions editor,
    // so the message has to use that wording or the reader cannot find it.
    const msg = postSaveErrorMessage('no-permission')
    expect(msg).toContain('Edit captions / hashtags')
    expect(msg).toMatch(/admin/i)
  })

  it('explains a completed relay without mentioning permissions', () => {
    const msg = postSaveErrorMessage('locked')
    expect(msg).toMatch(/completed/i)
    expect(msg).not.toMatch(/permission/i)
  })

  it('explains an out-of-scope post without mentioning permissions', () => {
    const msg = postSaveErrorMessage('not-found')
    expect(msg).toMatch(/not assigned to|no longer available/i)
    expect(msg).not.toMatch(/permission/i)
  })

  it('never blames permissions for an unexpected fault', () => {
    // The whole point of the change: a database fault used to read as
    // "you may not have permission".
    expect(POST_SAVE_UNEXPECTED).not.toMatch(/permission/i)
  })

  it('gives every reason its own distinct wording', () => {
    const all = (['no-permission', 'locked', 'not-found'] as const).map(
      postSaveErrorMessage,
    )
    expect(new Set(all).size).toBe(3)
  })
})

describe('isPostSaveReason', () => {
  it('recognises our named refusals', () => {
    expect(isPostSaveReason('no-permission')).toBe(true)
    expect(isPostSaveReason('locked')).toBe(true)
    expect(isPostSaveReason('not-found')).toBe(true)
  })

  it('does not mistake a real error message for a refusal', () => {
    expect(isPostSaveReason('connection reset by peer')).toBe(false)
    expect(isPostSaveReason('')).toBe(false)
  })
})

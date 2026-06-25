import { describe, it, expect } from 'vitest'
import { postHasNewAmReply } from '@/app/review/[token]/new-reply'

const clientAuthor = { kind: 'client' as const, reviewerName: 'Dana' }
const amAuthor = { kind: 'am' as const, userId: 'u', name: 'AM', avatarUrl: null }
function clientThread(amReplyAt: string | null) {
  const comments = [{ id: 'c0', author: clientAuthor, body: 'hi', createdAt: new Date('2026-06-24T08:00:00Z'), imageUrl: null, imageWidth: null, imageHeight: null }]
  if (amReplyAt) comments.push({ id: 'c1', author: amAuthor as never, body: 'reply', createdAt: new Date(amReplyAt), imageUrl: null, imageWidth: null, imageHeight: null } as never)
  return { id: 't', status: 'open' as const, pin: { kind: 'post' as const }, firstComment: comments[0], comments, commentCount: comments.length } as never
}
const amOnlyThread = { id: 't2', status: 'open', pin: { kind: 'image', x: 1, y: 1 }, firstComment: { id: 'x', author: amAuthor, body: 'a', createdAt: new Date('2026-06-24T10:00:00Z'), imageUrl: null, imageWidth: null, imageHeight: null }, comments: [{ id: 'x', author: amAuthor, body: 'a', createdAt: new Date('2026-06-24T10:00:00Z'), imageUrl: null, imageWidth: null, imageHeight: null }], commentCount: 1 } as never

describe('postHasNewAmReply', () => {
  it('true when an AM reply is newer than seenAt', () => {
    expect(postHasNewAmReply([clientThread('2026-06-24T10:00:00Z')], new Date('2026-06-24T09:00:00Z'))).toBe(true)
  })
  it('false when the AM reply is older than seenAt', () => {
    expect(postHasNewAmReply([clientThread('2026-06-24T08:30:00Z')], new Date('2026-06-24T09:00:00Z'))).toBe(false)
  })
  it('true when never seen (seenAt null) and there is any AM reply', () => {
    expect(postHasNewAmReply([clientThread('2026-06-24T08:30:00Z')], null)).toBe(true)
  })
  it('false for an AM-authored (non-client) thread', () => {
    expect(postHasNewAmReply([amOnlyThread], null)).toBe(false)
  })
  it('false when the client thread has no AM reply', () => {
    expect(postHasNewAmReply([clientThread(null)], null)).toBe(false)
  })
})

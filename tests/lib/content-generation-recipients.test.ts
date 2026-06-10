import { describe, it, expect } from 'vitest'
import { completionMentionUserIds } from '@/lib/content-generation-recipients'

describe('completionMentionUserIds', () => {
  it('notifies both the triggerer and the assigned AM when they differ', () => {
    expect(completionMentionUserIds('trigger-1', 'am-2')).toEqual(['trigger-1', 'am-2'])
  })

  it('dedupes when the triggerer is also the assigned AM', () => {
    expect(completionMentionUserIds('am-1', 'am-1')).toEqual(['am-1'])
  })

  it('falls back to just the triggerer when the client has no assigned AM', () => {
    expect(completionMentionUserIds('trigger-1', null)).toEqual(['trigger-1'])
  })
})

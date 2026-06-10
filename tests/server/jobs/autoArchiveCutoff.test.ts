import { describe, it, expect } from 'vitest'
import {
  AUTO_ARCHIVE_DAYS,
  archiveCutoff,
} from '@/server/jobs/autoArchiveCompletedRelays'

describe('auto-archive retention window', () => {
  it('archives completed relays 37 days after completion (67-day total lifecycle with the 30-day purge)', () => {
    expect(AUTO_ARCHIVE_DAYS).toBe(37)
  })

  it('archiveCutoff returns the timestamp 37 days before now', () => {
    const now = new Date('2026-06-10T00:00:00.000Z')
    // 37 days before 2026-06-10 is 2026-05-04
    expect(archiveCutoff(now).toISOString()).toBe('2026-05-04T00:00:00.000Z')
  })
})

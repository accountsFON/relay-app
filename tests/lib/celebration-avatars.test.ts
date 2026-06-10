import { describe, it, expect } from 'vitest'
import {
  buildClerkPhotoMap,
  resolveCelebrationParticipants,
} from '@/lib/celebration-avatars'

describe('buildClerkPhotoMap', () => {
  it('includes only users with a real Clerk photo (hasImage)', () => {
    const map = buildClerkPhotoMap([
      { id: 'clerk_1', imageUrl: 'https://img.clerk.com/real.jpg', hasImage: true },
      // hasImage false = Clerk's auto-generated initials avatar, not a real photo
      { id: 'clerk_2', imageUrl: 'https://img.clerk.com/generated.png', hasImage: false },
    ])

    expect(map.get('clerk_1')).toBe('https://img.clerk.com/real.jpg')
    expect(map.has('clerk_2')).toBe(false)
  })
})

describe('resolveCelebrationParticipants', () => {
  it('prefers the uploaded avatar over the Clerk photo', () => {
    const photos = new Map([['clerk_1', 'https://img.clerk.com/real.jpg']])
    const out = resolveCelebrationParticipants(
      [{ id: 'u1', name: 'Julio', avatarUrl: 'https://blob/upload.webp', clerkUserId: 'clerk_1' }],
      photos,
    )

    expect(out).toEqual([
      { id: 'u1', name: 'Julio', avatarUrl: 'https://blob/upload.webp' },
    ])
  })

  it('falls back to the Clerk photo when there is no uploaded avatar', () => {
    const photos = new Map([['clerk_1', 'https://img.clerk.com/real.jpg']])
    const out = resolveCelebrationParticipants(
      [{ id: 'u1', name: 'Julio', avatarUrl: null, clerkUserId: 'clerk_1' }],
      photos,
    )

    expect(out[0].avatarUrl).toBe('https://img.clerk.com/real.jpg')
  })

  it('is null when there is neither an upload nor a Clerk photo (gray icon)', () => {
    const out = resolveCelebrationParticipants(
      [{ id: 'u1', name: 'Julio', avatarUrl: null, clerkUserId: 'clerk_1' }],
      new Map(),
    )

    expect(out[0].avatarUrl).toBeNull()
  })
})

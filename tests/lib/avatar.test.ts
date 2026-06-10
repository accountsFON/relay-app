import { describe, it, expect } from 'vitest'
import { buildAvatarBlobPathname, isOwnAvatarBlobUrl, AVATAR_PREFIX } from '@/lib/avatar'

describe('buildAvatarBlobPathname', () => {
  it('namespaces under user-avatars/<userDbId>/ and strips path separators', () => {
    const p = buildAvatarBlobPathname('u_123', 'my/av..atar.webp')
    expect(p.startsWith('user-avatars/u_123/')).toBe(true)
    expect(p).not.toContain('/my/')
    expect(p.endsWith('-my_av..atar.webp')).toBe(true)
  })
})

describe('isOwnAvatarBlobUrl', () => {
  const ok = 'https://abc123.public.blob.vercel-storage.com/user-avatars/u_123/170-avatar.webp'
  it('accepts a blob-host URL under the caller own prefix', () => {
    expect(isOwnAvatarBlobUrl(ok, 'u_123')).toBe(true)
  })
  it('rejects another user prefix', () => {
    expect(isOwnAvatarBlobUrl(ok, 'u_999')).toBe(false)
  })
  it('rejects a non-blob host', () => {
    expect(isOwnAvatarBlobUrl('https://evil.example.com/user-avatars/u_123/x.webp', 'u_123')).toBe(false)
  })
  it('rejects a non-avatar pathname on the blob host', () => {
    expect(isOwnAvatarBlobUrl('https://abc.public.blob.vercel-storage.com/post-media/p1/x.webp', 'u_123')).toBe(false)
  })
  it('rejects unparseable input', () => {
    expect(isOwnAvatarBlobUrl('not a url', 'u_123')).toBe(false)
  })
  it('exposes the prefix constant', () => {
    expect(AVATAR_PREFIX).toBe('user-avatars')
  })
})

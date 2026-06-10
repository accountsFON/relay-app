// Server-free: do NOT import '@/db/client' here. The client uploader imports
// buildAvatarBlobPathname, and the upload route + server action import the
// validator. Keeping this Prisma-free avoids pulling the DB into client bundles.

export const AVATAR_PREFIX = 'user-avatars'

/** Blob key for a user's avatar: user-avatars/<userDbId>/<timestamp>-<safeName>. */
export function buildAvatarBlobPathname(userDbId: string, filename: string): string {
  const safeName = filename.replace(/[\\/]+/g, '_')
  return `${AVATAR_PREFIX}/${userDbId}/${Date.now()}-${safeName}`
}

/**
 * True only when `url` is a Vercel Blob host AND its path sits under this
 * caller's own avatar prefix. Used to reject arbitrary external URLs or
 * another user's blob path before writing User.avatarUrl.
 */
export function isOwnAvatarBlobUrl(url: string, userDbId: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  // Real: <id>.public.blob.vercel-storage.com ; stub tests: *.vercel-storage.test
  if (!/\.vercel-storage\.(com|test)$/.test(parsed.hostname)) return false
  return parsed.pathname.startsWith(`/${AVATAR_PREFIX}/${userDbId}/`)
}

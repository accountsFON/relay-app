import type { CelebrationParticipant } from '@/components/relay/batch-completion-lap'

/** A lap participant joined with the clerk id needed to look up a Clerk photo. */
export type CelebrationUser = {
  id: string
  name: string
  avatarUrl: string | null
  clerkUserId: string
}

/**
 * Real Clerk profile photos keyed by clerkUserId. Only users whose Clerk
 * account carries a genuine photo (hasImage) are present; Clerk's
 * auto-generated initials avatars are deliberately excluded.
 */
export type ClerkPhotoMap = Map<string, string>

/**
 * Build the Clerk photo map from a getUserList response, keeping only real
 * photos. Clerk always returns an `imageUrl` (it generates an initials
 * avatar when the user has none), so `hasImage` is the only reliable signal
 * that the URL is an actual profile photo worth showing as a fallback.
 */
export function buildClerkPhotoMap(
  clerkUsers: Array<{ id: string; imageUrl: string; hasImage: boolean }>,
): ClerkPhotoMap {
  const map: ClerkPhotoMap = new Map()
  for (const cu of clerkUsers) {
    if (cu.hasImage && cu.imageUrl) map.set(cu.id, cu.imageUrl)
  }
  return map
}

/**
 * Resolve the avatar shown for each completion-lap participant. Precedence:
 *   1. The user's uploaded avatar (User.avatarUrl) — the source of truth.
 *   2. Their real Clerk profile photo (e.g. from a Google sign-in).
 *   3. null — the lap renders its gray fallback icon.
 *
 * Deferring to the uploaded avatar first means the Clerk fallback never
 * overrides a photo the user chose in the avatar uploader.
 */
export function resolveCelebrationParticipants(
  users: CelebrationUser[],
  clerkPhotos: ClerkPhotoMap,
): CelebrationParticipant[] {
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl ?? clerkPhotos.get(u.clerkUserId) ?? null,
  }))
}

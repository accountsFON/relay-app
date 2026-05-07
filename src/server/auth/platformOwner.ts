/**
 * Platform-owner allow-list, sourced from the RELAY_PLATFORM_OWNERS env var
 * (comma-separated emails). Users whose email matches get User.platformOwner
 * set to true during onboarding or migration, which short-circuits the
 * permission resolver to allow everything on every Organization.
 */

export function getPlatformOwnerAllowList(): string[] {
  const raw = process.env.RELAY_PLATFORM_OWNERS ?? ''
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/** Case-insensitive check. */
export function isPlatformOwnerEmail(email: string): boolean {
  return getPlatformOwnerAllowList().includes(email.trim().toLowerCase())
}

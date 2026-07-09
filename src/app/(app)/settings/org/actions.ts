'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { normalizeBrandColor, normalizeBrandLogoUrl } from '@/lib/org-branding'
import { updateOrgBranding } from '@/server/repositories/organizations'

/**
 * Set the org's white-label branding (P2 #21). Admin-only (`admin.portal`),
 * org-scoped. A valid hex color / http(s) URL is stored; an empty field clears
 * it; a non-empty-but-invalid value is rejected so the form surfaces the error
 * rather than silently dropping it.
 */
export async function updateOrgBrandingAction(input: {
  brandLogoUrl: string
  brandColor: string
}): Promise<{ ok: true }> {
  const ctx = await requireAdminPortal()

  const rawLogo = input.brandLogoUrl?.trim() ?? ''
  const rawColor = input.brandColor?.trim() ?? ''
  const brandLogoUrl = normalizeBrandLogoUrl(rawLogo)
  const brandColor = normalizeBrandColor(rawColor)

  if (rawLogo && !brandLogoUrl) {
    throw new Error('Enter a valid logo URL starting with http:// or https://')
  }
  if (rawColor && !brandColor) {
    throw new Error('Enter a valid hex color like #0a84ff')
  }

  await updateOrgBranding(ctx.organizationDbId, { brandLogoUrl, brandColor })
  revalidatePath('/settings/org')
  return { ok: true }
}

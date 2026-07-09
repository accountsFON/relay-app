import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireAdminPortal: vi.fn().mockResolvedValue({ organizationDbId: 'org_1' }),
}))

vi.mock('@/server/repositories/organizations', () => ({
  updateOrgBranding: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireAdminPortal } from '@/server/middleware/permissions'
import { updateOrgBranding } from '@/server/repositories/organizations'
import { updateOrgBrandingAction } from '@/app/(app)/settings/org/actions'

beforeEach(() => vi.clearAllMocks())

describe('updateOrgBrandingAction (P2 #21)', () => {
  it('is admin-gated and persists normalized, org-scoped branding', async () => {
    await updateOrgBrandingAction({
      brandLogoUrl: ' https://cdn.x.co/l.png ',
      brandColor: '#0A84FF',
    })
    expect(requireAdminPortal).toHaveBeenCalled()
    expect(updateOrgBranding).toHaveBeenCalledWith('org_1', {
      brandLogoUrl: 'https://cdn.x.co/l.png',
      brandColor: '#0A84FF',
    })
  })

  it('clears branding when both fields are empty', async () => {
    await updateOrgBrandingAction({ brandLogoUrl: '', brandColor: '' })
    expect(updateOrgBranding).toHaveBeenCalledWith('org_1', {
      brandLogoUrl: null,
      brandColor: null,
    })
  })

  it('rejects a non-empty invalid color without persisting', async () => {
    await expect(
      updateOrgBrandingAction({ brandLogoUrl: '', brandColor: 'blue' }),
    ).rejects.toThrow(/hex color/i)
    expect(updateOrgBranding).not.toHaveBeenCalled()
  })

  it('rejects a non-http(s) logo URL without persisting', async () => {
    await expect(
      updateOrgBrandingAction({ brandLogoUrl: 'javascript:alert(1)', brandColor: '' }),
    ).rejects.toThrow(/logo url/i)
    expect(updateOrgBranding).not.toHaveBeenCalled()
  })
})

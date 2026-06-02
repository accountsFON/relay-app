import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { redirectAccessDenied } from '@/server/auth/access'

vi.mock('next/navigation', () => ({
  // Real redirect() throws to halt rendering; the mock is a plain spy so the
  // call returns and we can assert on the argument.
  redirect: vi.fn(),
}))

describe('redirectAccessDenied()', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear()
  })

  it('redirects to /dashboard?denied=1', () => {
    redirectAccessDenied()
    expect(redirect).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith('/dashboard?denied=1')
  })
})

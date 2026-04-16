import { describe, it, expect } from 'vitest'

// Test the public route patterns — not Clerk itself (that's an integration test)
const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/approve/']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

describe('public route matching', () => {
  it('treats /sign-in as public', () => {
    expect(isPublicRoute('/sign-in')).toBe(true)
  })

  it('treats /sign-in/sso-callback as public', () => {
    expect(isPublicRoute('/sign-in/sso-callback')).toBe(true)
  })

  it('treats /approve/abc123 as public', () => {
    expect(isPublicRoute('/approve/abc123token')).toBe(true)
  })

  it('treats /dashboard as protected', () => {
    expect(isPublicRoute('/dashboard')).toBe(false)
  })

  it('treats /clients/123 as protected', () => {
    expect(isPublicRoute('/clients/123')).toBe(false)
  })
})
